import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5003;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'Deployment Service' });
});

// Deployment endpoints
app.post('/ec2', (req, res) => {
  res.json({ message: 'Deploy EC2 instance endpoint' });
});

app.post('/s3', (req, res) => {
  res.json({ message: 'Deploy S3 bucket endpoint' });
});

app.post('/iam', (req, res) => {
  res.json({ message: 'Deploy IAM user endpoint' });
});

app.get('/deployments', (req, res) => {
  res.json({ message: 'List deployments endpoint' });
});

app.listen(PORT, () => {
  console.log(`🚀 Deployment Service running on port ${PORT}`);
});
