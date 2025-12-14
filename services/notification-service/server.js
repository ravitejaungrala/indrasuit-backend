import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5004;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'Notification Service' });
});

// Notification endpoints
app.post('/send', (req, res) => {
  res.json({ message: 'Send notification endpoint' });
});

app.get('/events', (req, res) => {
  res.json({ message: 'Get event history endpoint' });
});

app.listen(PORT, () => {
  console.log(`📧 Notification Service running on port ${PORT}`);
});
