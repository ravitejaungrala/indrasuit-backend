import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import path from 'path';

const execPromise = util.promisify(exec);

class DockerService {
  async generateDockerfile(appType, repoPath, startCommand, port) {
    const dockerfiles = {
      nodejs: `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE ${port}
CMD ${startCommand}`,

      react: `FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`,

      nextjs: `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN npm run build
EXPOSE ${port}
CMD ["npm", "start"]`,

      python: `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE ${port}
CMD ${startCommand}`,

      static: `FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`
    };

    const dockerfile = dockerfiles[appType] || dockerfiles.nodejs;
    const dockerfilePath = path.join(repoPath, 'Dockerfile');
    
    await fs.writeFile(dockerfilePath, dockerfile);
    console.log(`Generated Dockerfile for ${appType}`);
    
    return dockerfilePath;
  }

  async buildImage(repoPath, imageName, tag = 'latest') {
    try {
      console.log(`Building Docker image: ${imageName}:${tag}`);
      
      const { stdout, stderr } = await execPromise(
        `docker build -t ${imageName}:${tag} .`,
        { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 }
      );
      
      console.log('Docker build output:', stdout);
      if (stderr) console.log('Docker build stderr:', stderr);
      
      return { success: true, output: stdout };
    } catch (error) {
      console.error('Error building Docker image:', error);
      throw new Error(`Docker build failed: ${error.message}`);
    }
  }

  async tagImage(sourceImage, targetImage) {
    try {
      console.log(`Tagging image: ${sourceImage} -> ${targetImage}`);
      await execPromise(`docker tag ${sourceImage} ${targetImage}`);
      return true;
    } catch (error) {
      console.error('Error tagging image:', error);
      throw new Error(`Failed to tag image: ${error.message}`);
    }
  }

  async pushImage(imageName) {
    try {
      console.log(`Pushing image: ${imageName}`);
      
      const { stdout, stderr } = await execPromise(
        `docker push ${imageName}`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      
      console.log('Docker push output:', stdout);
      if (stderr) console.log('Docker push stderr:', stderr);
      
      return { success: true, output: stdout };
    } catch (error) {
      console.error('Error pushing Docker image:', error);
      throw new Error(`Docker push failed: ${error.message}`);
    }
  }

  async pullImage(imageName) {
    try {
      console.log(`Pulling Docker image: ${imageName}`);
      
      const { stdout, stderr } = await execPromise(
        `docker pull ${imageName}`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      
      console.log('Docker pull output:', stdout);
      if (stderr) console.log('Docker pull stderr:', stderr);
      
      return { success: true, output: stdout };
    } catch (error) {
      console.error('Error pulling Docker image:', error);
      throw new Error(`Docker pull failed: ${error.message}`);
    }
  }

  async removeImage(imageName) {
    try {
      await execPromise(`docker rmi ${imageName}`);
      console.log(`Removed image: ${imageName}`);
    } catch (error) {
      console.error('Error removing image:', error);
    }
  }
}

export default new DockerService();
