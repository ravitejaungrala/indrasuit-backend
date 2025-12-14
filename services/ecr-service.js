import { ECRClient, CreateRepositoryCommand, DescribeRepositoriesCommand, GetAuthorizationTokenCommand } from '@aws-sdk/client-ecr';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

class ECRService {
  getClient(credentials, region) {
    return new ECRClient({
      region: region || 'us-east-1',
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey
      }
    });
  }

  async createRepository(credentials, region, repositoryName) {
    const client = this.getClient(credentials, region);
    
    try {
      // Check if repository exists
      try {
        const describeCommand = new DescribeRepositoriesCommand({
          repositoryNames: [repositoryName]
        });
        const existing = await client.send(describeCommand);
        console.log(`Repository ${repositoryName} already exists`);
        return existing.repositories[0];
      } catch (error) {
        if (error.name !== 'RepositoryNotFoundException') {
          throw error;
        }
      }
      
      // Create new repository
      const createCommand = new CreateRepositoryCommand({
        repositoryName: repositoryName,
        imageScanningConfiguration: {
          scanOnPush: false
        },
        imageTagMutability: 'MUTABLE'
      });
      
      const response = await client.send(createCommand);
      console.log(`Created ECR repository: ${repositoryName}`);
      return response.repository;
    } catch (error) {
      console.error('Error creating ECR repository:', error);
      throw new Error(`Failed to create ECR repository: ${error.message}`);
    }
  }

  async getAuthToken(credentials, region) {
    const client = this.getClient(credentials, region);
    
    try {
      const command = new GetAuthorizationTokenCommand({});
      const response = await client.send(command);
      
      const authData = response.authorizationData[0];
      const token = Buffer.from(authData.authorizationToken, 'base64').toString('utf-8');
      const [username, password] = token.split(':');
      
      return {
        username,
        password,
        proxyEndpoint: authData.proxyEndpoint,
        expiresAt: authData.expiresAt
      };
    } catch (error) {
      console.error('Error getting ECR auth token:', error);
      throw new Error(`Failed to get ECR auth token: ${error.message}`);
    }
  }

  async loginToECR(credentials, region) {
    try {
      const authToken = await this.getAuthToken(credentials, region);
      
      console.log(`Logging into ECR: ${authToken.proxyEndpoint}`);
      
      const loginCommand = `docker login -u ${authToken.username} -p ${authToken.password} ${authToken.proxyEndpoint}`;
      await execPromise(loginCommand);
      
      console.log('Successfully logged into ECR');
      return authToken.proxyEndpoint;
    } catch (error) {
      console.error('Error logging into ECR:', error);
      throw new Error(`Failed to login to ECR: ${error.message}`);
    }
  }

  getRepositoryUri(accountId, region, repositoryName) {
    return `${accountId}.dkr.ecr.${region}.amazonaws.com/${repositoryName}`;
  }

  async getAccountId(credentials, region) {
    try {
      const authToken = await this.getAuthToken(credentials, region);
      const endpoint = authToken.proxyEndpoint;
      const accountId = endpoint.split('.')[0].replace('https://', '');
      return accountId;
    } catch (error) {
      console.error('Error getting account ID:', error);
      throw error;
    }
  }
}

export default new ECRService();
