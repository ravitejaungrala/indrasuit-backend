import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'Auth Service' });
});

// Auth endpoints
app.post('/register', (req, res) => {
  res.json({ message: 'User registration endpoint' });
});

app.post('/login', (req, res) => {
  res.json({ message: 'User login endpoint' });
});

app.listen(PORT, () => {
  console.log(`🔐 Auth Service running on port ${PORT}`);
});
