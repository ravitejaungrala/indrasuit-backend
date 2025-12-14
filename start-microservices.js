import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const services = [
  { name: 'API Gateway', path: 'services/api-gateway', port: 5000 },
  { name: 'Auth Service', path: 'services/auth-service', port: 5001 },
  { name: 'AWS Service', path: 'services/aws-service', port: 5002 },
  { name: 'Deployment Service', path: 'services/deployment-service', port: 5003 },
  { name: 'Notification Service', path: 'services/notification-service', port: 5004 }
];

console.log('🚀 Starting RaDynamics Microservices...\n');

services.forEach(service => {
  const servicePath = path.join(__dirname, service.path);
  
  console.log(`Starting ${service.name} on port ${service.port}...`);
  
  const child = spawn('npm', ['run', 'dev'], {
    cwd: servicePath,
    stdio: 'inherit',
    shell: true
  });

  child.on('error', (error) => {
    console.error(`Error starting ${service.name}:`, error);
  });
});

console.log('\n✅ All microservices started!');
console.log('\nServices running on:');
services.forEach(s => {
  console.log(`  - ${s.name}: http://localhost:${s.port}`);
});
