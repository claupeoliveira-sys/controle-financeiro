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
if (!MONGODB_URI) {
  // Sem Mongo, a API não funciona, mas o static pode abrir.
  mongoConnectionStatus = 'not_configured';
  mongoConnectionReason = 'MONGODB_URI nao definido no .env';
  console.warn('MONGODB_URI nao definido. Configure no .env.');
} else {
  mongoConnectionStatus = 'connecting';
  mongoConnectionReason = 'Tentando conectar ao MongoDB Atlas...';
  mongoose
    .connect(MONGODB_URI)
    .then(() => {
      mongoConnectionStatus = 'connected';
      mongoConnectionReason = 'Conectado com sucesso ao MongoDB Atlas';
      console.log('MongoDB conectado.');
    })
    .catch(err => {
      mongoConnectionStatus = 'error';
      mongoConnectionReason = err?.message || 'Erro desconhecido ao conectar';
      console.error('Erro ao conectar no MongoDB:', err);
      process.exit(1);
    });

  mongoose.connection.on('error', err => {
    mongoConnectionStatus = 'error';
    mongoConnectionReason = err?.message || 'Erro de conexao MongoDB';
  });
  mongoose.connection.on('disconnected', () => {
    mongoConnectionStatus = 'disconnected';
    mongoConnectionReason = 'Conexao com MongoDB encerrada';
  });
  mongoose.connection.on('reconnected', () => {
    mongoConnectionStatus = 'connected';
    mongoConnectionReason = 'Conexao com MongoDB restabelecida';
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
  res.json({
    ok: true,
    mongo: {
      ready: mongoReady,
      status: mongoConnectionStatus,
      reason: mongoConnectionReason,
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

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

