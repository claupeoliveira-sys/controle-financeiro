const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
let mongoConnectionStatus = 'disconnected';
let mongoConnectionReason = 'Nao inicializado';

// Servir a própria pasta da aplicação
const publicDir = __dirname;
app.use(express.static(publicDir));

// Body JSON para a API
app.use(express.json({ limit: '10mb' }));

// MongoDB Atlas
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI || !String(MONGODB_URI).trim()) {
  // Sem Mongo, a API de persistência fica indisponível.
  mongoConnectionStatus = 'not_configured';
  mongoConnectionReason = 'MONGODB_URI nao definida no .env';
  console.error('ERRO: MONGODB_URI não definida no .env. A conexão com o MongoDB será ignorada.');
} else {
  mongoConnectionStatus = 'connecting';
  mongoConnectionReason = 'Tentando conectar ao MongoDB Atlas...';
  console.log('Tentando conectar ao MongoDB...');
  mongoose
    .connect(MONGODB_URI)
    .then(() => {
      mongoConnectionStatus = 'connected';
      mongoConnectionReason = 'Conectado ao MongoDB';
      console.log('Conectado ao MongoDB Atlas com sucesso!');
    })
    .catch(err => {
      mongoConnectionStatus = 'error';
      mongoConnectionReason = err?.message || 'Erro desconhecido ao conectar';
      console.error(
        `ERRO ao conectar ao MongoDB: ${mongoConnectionReason}. Verifique a MONGODB_URI e as permissões de rede.`
      );
    });

  mongoose.connection.on('error', err => {
    mongoConnectionStatus = 'error';
    mongoConnectionReason = err?.message || 'Erro de conexao MongoDB';
    console.error(`ERRO de conexão MongoDB (evento): ${mongoConnectionReason}`);
  });
  mongoose.connection.on('disconnected', () => {
    mongoConnectionStatus = 'disconnected';
    mongoConnectionReason = 'Conexao com MongoDB encerrada';
    console.warn('MongoDB desconectado.');
  });
  mongoose.connection.on('reconnected', () => {
    mongoConnectionStatus = 'connected';
    mongoConnectionReason = 'Conexao com MongoDB restabelecida';
    console.log('MongoDB reconectado.');
  });
}

const StateSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    transactions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    recurringCosts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    variableCostOverrides: { type: [mongoose.Schema.Types.Mixed], default: [] }
  },
  { versionKey: false }
);

const State = mongoose.models.State || mongoose.model('State', StateSchema, 'app_state');

app.get('/api/health', (req, res) => {
  const mongoReady = mongoose.connection.readyState === 1;
  const status = mongoReady ? 'ok' : 'error';
  const reason = mongoReady
    ? 'Conectado ao MongoDB'
    : (mongoConnectionStatus === 'not_configured'
      ? 'MongoDB não configurado'
      : 'MongoDB desconectado ou inacessível');

  res.json({
    ok: true,
    mongo: {
      ready: mongoReady,
      status,
      reason,
      detail: mongoConnectionReason,
      connectionStatus: mongoConnectionStatus,
      readyState: mongoose.connection.readyState
    }
  });
});

app.get('/api/state', async (req, res) => {
  try {
    if (!MONGODB_URI) return res.status(503).json({ error: 'MongoDB nao configurado' });
    const doc = await State.findById('default').lean();
    if (!doc) {
      return res.json({
        _id: 'default',
        transactions: [],
        recurringCosts: [],
        variableCostOverrides: []
      });
    }
    return res.json(doc);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao ler estado' });
  }
});

app.post('/api/state', async (req, res) => {
  try {
    if (!MONGODB_URI) return res.status(503).json({ error: 'MongoDB nao configurado' });

    const payload = req.body || {};
    const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
    const recurringCosts = Array.isArray(payload.recurringCosts) ? payload.recurringCosts : [];
    const variableCostOverrides = Array.isArray(payload.variableCostOverrides)
      ? payload.variableCostOverrides
      : [];

    // Upsert único para usuário único.
    const updated = await State.findByIdAndUpdate(
      'default',
      {
        _id: 'default',
        transactions,
        recurringCosts,
        variableCostOverrides
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao salvar estado' });
  }
});

console.log('Rotas da API (/api/state, /api/health) configuradas.');

// Middleware global para erros não tratados nas rotas
app.use((err, req, res, next) => {
  console.error('ERRO NO SERVIDOR:', err?.stack || err);
  res.status(500).send('Algo deu errado no servidor!');
});

app.listen(PORT, () => {
  console.log(`Servidor Express rodando na porta ${PORT}`);
});

