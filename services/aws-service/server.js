import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'AWS Service' });
});

// AWS account endpoints
app.post('/accounts', (req, res) => {
  res.json({ message: 'Add AWS account endpoint' });
});

app.get('/accounts', (req, res) => {
  res.json({ message: 'List AWS accounts endpoint' });
});

app.post('/validate', (req, res) => {
  res.json({ message: 'Validate AWS credentials endpoint' });
});

app.listen(PORT, () => {
  console.log(`☁️  AWS Service running on port ${PORT}`);
});
