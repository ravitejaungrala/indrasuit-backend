import { 
  ECSClient, 
  CreateClusterCommand, 
  DescribeClustersCommand,
  RegisterTaskDefinitionCommand,
  CreateServiceCommand,
  UpdateServiceCommand,
  DescribeServicesCommand,
  StopTaskCommand,
  ListTasksCommand
} from '@aws-sdk/client-ecs';

class ECSService {
  getClient(credentials, region) {
    return new ECSClient({
      region: region || 'us-east-1',
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey
      }
    });
  }

  async createCluster(credentials, region, clusterName) {
    const client = this.getClient(credentials, region);
    
    try {
      // Check if cluster exists
      const describeCommand = new DescribeClustersCommand({
        clusters: [clusterName]
      });
      const existing = await client.send(describeCommand);
      
      if (existing.clusters && existing.clusters.length > 0 && existing.clusters[0].status === 'ACTIVE') {
        console.log(`Cluster ${clusterName} already exists`);
        return existing.clusters[0];
      }
      
      // Create new cluster
      const createCommand = new CreateClusterCommand({
        clusterName: clusterName
      });
      
      const response = await client.send(createCommand);
      console.log(`Created ECS cluster: ${clusterName}`);
      return response.cluster;
    } catch (error) {
      console.error('Error creating ECS cluster:', error);
      throw new Error(`Failed to create ECS cluster: ${error.message}`);
    }
  }

  async registerTaskDefinition(credentials, region, config) {
    const client = this.getClient(credentials, region);
    
    try {
      const command = new RegisterTaskDefinitionCommand({
        family: config.family,
        networkMode: 'awsvpc',
        requiresCompatibilities: ['FARGATE'],
        cpu: config.cpu || '512',
        memory: config.memory || '1024',
        executionRoleArn: config.executionRoleArn,
        taskRoleArn: config.taskRoleArn,
        containerDefinitions: [
          {
            name: config.containerName,
            image: config.image,
            portMappings: [
              {
                containerPort: config.port,
                protocol: 'tcp'
              }
            ],
            environment: config.environment || [],
            logConfiguration: {
              logDriver: 'awslogs',
              options: {
                'awslogs-group': `/ecs/${config.family}`,
                'awslogs-region': region,
                'awslogs-stream-prefix': 'ecs',
                'awslogs-create-group': 'true'
              }
            },
            essential: true
          }
        ]
      });
      
      const response = await client.send(command);
      console.log(`Registered task definition: ${config.family}`);
      return response.taskDefinition;
    } catch (error) {
      console.error('Error registering task definition:', error);
      throw new Error(`Failed to register task definition: ${error.message}`);
    }
  }

  async createService(credentials, region, config) {
    const client = this.getClient(credentials, region);
    
    try {
      const command = new CreateServiceCommand({
        cluster: config.cluster,
        serviceName: config.serviceName,
        taskDefinition: config.taskDefinition,
        desiredCount: config.desiredCount || 1,
        launchType: 'FARGATE',
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: config.subnets,
            securityGroups: config.securityGroups,
            assignPublicIp: 'ENABLED'
          }
        },
        loadBalancers: config.loadBalancers || []
      });
      
      const response = await client.send(command);
      console.log(`Created ECS service: ${config.serviceName}`);
      return response.service;
    } catch (error) {
      console.error('Error creating ECS service:', error);
      throw new Error(`Failed to create ECS service: ${error.message}`);
    }
  }

  async updateService(credentials, region, cluster, serviceName, taskDefinition) {
    const client = this.getClient(credentials, region);
    
    try {
      const command = new UpdateServiceCommand({
        cluster: cluster,
        service: serviceName,
        taskDefinition: taskDefinition,
        forceNewDeployment: true
      });
      
      const response = await client.send(command);
      console.log(`Updated ECS service: ${serviceName}`);
      return response.service;
    } catch (error) {
      console.error('Error updating ECS service:', error);
      throw new Error(`Failed to update ECS service: ${error.message}`);
    }
  }

  async stopService(credentials, region, cluster, serviceName) {
    const client = this.getClient(credentials, region);
    
    try {
      const command = new UpdateServiceCommand({
        cluster: cluster,
        service: serviceName,
        desiredCount: 0
      });
      
      const response = await client.send(command);
      console.log(`Stopped ECS service: ${serviceName}`);
      return response.service;
    } catch (error) {
      console.error('Error stopping ECS service:', error);
      throw new Error(`Failed to stop ECS service: ${error.message}`);
    }
  }

  async startService(credentials, region, cluster, serviceName) {
    const client = this.getClient(credentials, region);
    
    try {
      const command = new UpdateServiceCommand({
        cluster: cluster,
        service: serviceName,
        desiredCount: 1
      });
      
      const response = await client.send(command);
      console.log(`Started ECS service: ${serviceName}`);
      return response.service;
    } catch (error) {
      console.error('Error starting ECS service:', error);
      throw new Error(`Failed to start ECS service: ${error.message}`);
    }
  }

  async getServiceStatus(credentials, region, cluster, serviceName) {
    const client = this.getClient(credentials, region);
    
    try {
      const command = new DescribeServicesCommand({
        cluster: cluster,
        services: [serviceName]
      });
      
      const response = await client.send(command);
      return response.services[0];
    } catch (error) {
      console.error('Error getting service status:', error);
      throw new Error(`Failed to get service status: ${error.message}`);
    }
  }
}

export default new ECSService();
