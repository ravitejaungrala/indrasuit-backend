import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'API Gateway' });
});

// Route to auth service
app.use('/api/auth', (req, res) => {
  // Forward to auth service on port 5001
  res.json({ message: 'Route to auth service' });
});

// Route to AWS service
app.use('/api/aws', (req, res) => {
  // Forward to AWS service on port 5002
  res.json({ message: 'Route to AWS service' });
});

// Route to deployment service
app.use('/api/deploy', (req, res) => {
  // Forward to deployment service on port 5003
  res.json({ message: 'Route to deployment service' });
});

app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
});
