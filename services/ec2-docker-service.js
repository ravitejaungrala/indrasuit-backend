import { EC2Client, DescribeInstancesCommand, AuthorizeSecurityGroupIngressCommand } from '@aws-sdk/client-ec2';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';

class EC2DockerService {
  getEC2Client(credentials, region) {
    console.log('🔧 Creating EC2 Client');
    console.log('Region:', region);
    console.log('Credentials present:', {
      hasAccessKeyId: !!credentials?.accessKeyId,
      hasSecretAccessKey: !!credentials?.secretAccessKey,
      accessKeyIdLength: credentials?.accessKeyId?.length || 0
    });
    
    if (!credentials || !credentials.accessKeyId || !credentials.secretAccessKey) {
      throw new Error('Invalid AWS credentials provided');
    }
    
    return new EC2Client({
      region: region || 'us-east-1',
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey
      }
    });
  }

  getSSMClient(credentials, region) {
    return new SSMClient({
      region: region || 'us-east-1',
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey
      }
    });
  }

  async getInstanceDetails(credentials, region, instanceId) {
    const ec2 = this.getEC2Client(credentials, region);
    
    try {
      const command = new DescribeInstancesCommand({
        InstanceIds: [instanceId]
      });
      
      const response = await ec2.send(command);
      
      if (!response.Reservations || response.Reservations.length === 0) {
        throw new Error('Instance not found');
      }
      
      const instance = response.Reservations[0].Instances[0];
      return {
        instanceId: instance.InstanceId,
        publicIp: instance.PublicIpAddress,
        privateIp: instance.PrivateIpAddress,
        state: instance.State.Name,
        instanceType: instance.InstanceType,
        securityGroups: instance.SecurityGroups
      };
    } catch (error) {
      console.error('Error getting instance details:', error);
      throw new Error(`Failed to get instance details: ${error.message}`);
    }
  }

  async openSecurityGroupPort(credentials, region, securityGroupId, port) {
    const ec2 = this.getEC2Client(credentials, region);
    
    try {
      console.log(`🔓 Opening port ${port} in security group ${securityGroupId}`);
      
      const command = new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpPermissions: [
          {
            IpProtocol: 'tcp',
            FromPort: parseInt(port),
            ToPort: parseInt(port),
            IpRanges: [
              {
                CidrIp: '0.0.0.0/0',
                Description: `Docker app port ${port} - Auto-opened by RaDynamics`
              }
            ]
          }
        ]
      });
      
      await ec2.send(command);
      console.log(`✅ Port ${port} opened successfully in security group ${securityGroupId}`);
      return true;
    } catch (error) {
      if (error.name === 'InvalidPermission.Duplicate') {
        console.log(`ℹ️ Port ${port} is already open in security group ${securityGroupId}`);
        return true;
      }
      console.error(`❌ Failed to open port ${port}:`, error.message);
      return false;
    }
  }

  async deployDockerToEC2(credentials, region, instanceId, dockerImage, port, envVars = {}) {
    console.log('🚀 Deploying Docker container to EC2');
    console.log('Instance ID:', instanceId);
    console.log('Docker Image:', dockerImage);
    console.log('Port:', port);
    
    const ssm = this.getSSMClient(credentials, region);
    
    // Check if instance is managed by SSM
    console.log('🔍 Checking if instance is managed by SSM...');
    try {
      const { DescribeInstanceInformationCommand } = await import('@aws-sdk/client-ssm');
      const checkCommand = new DescribeInstanceInformationCommand({
        Filters: [
          {
            Key: 'InstanceIds',
            Values: [instanceId]
          }
        ]
      });
      
      const checkResponse = await ssm.send(checkCommand);
      
      if (!checkResponse.InstanceInformationList || checkResponse.InstanceInformationList.length === 0) {
        console.error('❌ Instance is NOT managed by SSM');
        throw new Error(
          `EC2 instance ${instanceId} is not managed by AWS Systems Manager. ` +
          `Please ensure: 1) SSM Agent is installed and running, ` +
          `2) Instance has an IAM role with AmazonSSMManagedInstanceCore policy attached, ` +
          `3) Instance has internet connectivity or VPC endpoints for SSM.`
        );
      }
      
      const instanceInfo = checkResponse.InstanceInformationList[0];
      console.log('✅ Instance is managed by SSM');
      console.log('SSM Agent Version:', instanceInfo.AgentVersion);
      console.log('Ping Status:', instanceInfo.PingStatus);
      console.log('Platform:', instanceInfo.PlatformType, instanceInfo.PlatformName);
      
      if (instanceInfo.PingStatus !== 'Online') {
        throw new Error(
          `SSM Agent is not online (Status: ${instanceInfo.PingStatus}). ` +
          `Please check if the SSM agent is running on the instance.`
        );
      }
    } catch (error) {
      if (error.message.includes('not managed by')) {
        throw error;
      }
      console.error('Error checking SSM status:', error);
      throw new Error(
        `Failed to verify SSM connectivity: ${error.message}. ` +
        `Please ensure the EC2 instance has an IAM role with SSM permissions.`
      );
    }
    
    // Build environment variables string
    const envString = Object.entries(envVars)
      .map(([key, value]) => `-e ${key}="${value}"`)
      .join(' ');
    
    // Container name based on image
    const containerName = dockerImage.split('/').pop().split(':')[0] + '-app';
    
    // Build Docker commands - Simple and robust approach
    const dockerRunCmd = envString 
      ? `sudo docker run -d --name ${containerName} --restart unless-stopped -p ${port}:${port} ${envString} ${dockerImage}`
      : `sudo docker run -d --name ${containerName} --restart unless-stopped -p ${port}:${port} ${dockerImage}`;

    // SIMPLE APPROACH - No template literals, just basic strings
    const imageName = dockerImage.replace(/[^a-zA-Z0-9\-_\.\/\:]/g, ''); // Clean image name (keep colon for tag)
    const containerName2 = containerName.replace(/[^a-zA-Z0-9\-_]/g, ''); // Clean container name
    
    const commands = [
      '#!/bin/bash',
      'set -e',
      'echo "=== Docker Deployment Started ==="',
      'echo "Image: ' + imageName + '"',
      'echo "Port: ' + port + '"',
      'echo "Container: ' + containerName2 + '"',
      '',
      '# Install Docker if needed',
      'if ! command -v docker >/dev/null 2>&1; then',
      '    echo "Installing Docker..."',
      '    if command -v apt-get >/dev/null 2>&1; then',
      '        export DEBIAN_FRONTEND=noninteractive',
      '        sudo apt-get update -y',
      '        sudo apt-get install -y docker.io',
      '        sudo systemctl start docker',
      '        sudo systemctl enable docker',
      '    elif command -v yum >/dev/null 2>&1; then',
      '        sudo yum update -y',
      '        sudo yum install -y docker',
      '        sudo service docker start',
      '    fi',
      'fi',
      '',
      '# Start Docker',
      'sudo systemctl start docker 2>/dev/null || sudo service docker start',
      '',
      '# Clean up',
      'sudo docker stop ' + containerName2 + ' 2>/dev/null || true',
      'sudo docker rm ' + containerName2 + ' 2>/dev/null || true',
      '',
      '# Pull and run with port 3000:3000 only',
      'echo "Pulling image: ' + imageName + '"',
      'sudo docker pull ' + imageName,
      'echo "Starting container: ' + containerName2 + ' with port ' + port + ':' + port + '"',
      'sudo docker run -d --name ' + containerName2 + ' --restart unless-stopped -p ' + port + ':' + port + ' -e PORT=' + port + ' ' + imageName,
      '',
      '# Verify',
      'sleep 5',
      'if sudo docker ps | grep ' + containerName2 + '; then',
      '    echo "SUCCESS: Container running on port ' + port + '"',
      '    PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)',
      '    echo "Access URL: http://$PUBLIC_IP:' + port + '"',
      'else',
      '    echo "ERROR: Container failed to start"',
      '    sudo docker logs ' + containerName2,
      '    exit 1',
      'fi'
    ];
    
    try {
      console.log('📤 Sending deployment commands to EC2 via SSM...');
      
      const sendCommand = new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: commands
        },
        TimeoutSeconds: 600 // 10 minutes timeout
      });
      
      const response = await ssm.send(sendCommand);
      const commandId = response.Command.CommandId;
      
      console.log('✅ Command sent, ID:', commandId);
      console.log('⏳ Waiting for command to complete...');
      
      // Wait for command to complete
      await this.waitForCommandCompletion(ssm, commandId, instanceId);
      
      // Get command output
      const output = await this.getCommandOutput(ssm, commandId, instanceId);
      
      console.log('✅ Deployment completed successfully');
      console.log('📋 Output:', output.substring(0, 500)); // First 500 chars
      
      return {
        success: true,
        commandId: commandId,
        output: output,
        containerName: containerName
      };
      
    } catch (error) {
      console.error('❌ EC2 Docker deployment failed:', error);
      throw new Error(`Failed to deploy to EC2: ${error.message}`);
    }
  }

  async waitForCommandCompletion(ssm, commandId, instanceId, maxWaitTime = 300000) {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const command = new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId
        });
        
        const response = await ssm.send(command);
        const status = response.Status;
        
        console.log('Command status:', status);
        
        if (status === 'Success') {
          return true;
        } else if (status === 'Failed' || status === 'Cancelled' || status === 'TimedOut') {
          throw new Error(`Command ${status}: ${response.StandardErrorContent || 'Unknown error'}`);
        }
        
        // Still in progress, wait and retry
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        if (error.name === 'InvocationDoesNotExist') {
          // Command not ready yet, wait and retry
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        } else {
          throw error;
        }
      }
    }
    
    throw new Error('Command execution timed out');
  }

  async getCommandOutput(ssm, commandId, instanceId) {
    try {
      const command = new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: instanceId
      });
      
      const response = await ssm.send(command);
      
      return response.StandardOutputContent || '';
    } catch (error) {
      console.error('Error getting command output:', error);
      return 'Output not available';
    }
  }

  async getContainerStatus(credentials, region, instanceId, containerName) {
    const ssm = this.getSSMClient(credentials, region);
    
    const commands = [
      'sudo docker ps -a --filter name=' + containerName + ' --format "{{.Status}}"'
    ];
    
    try {
      const sendCommand = new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: commands
        }
      });
      
      const response = await ssm.send(sendCommand);
      const commandId = response.Command.CommandId;
      
      await this.waitForCommandCompletion(ssm, commandId, instanceId);
      const output = await this.getCommandOutput(ssm, commandId, instanceId);
      
      return output.trim();
    } catch (error) {
      console.error('Error getting container status:', error);
      return 'Unknown';
    }
  }

  async stopContainer(credentials, region, instanceId, containerName) {
    const ssm = this.getSSMClient(credentials, region);
    
    const commands = [
      'sudo docker stop ' + containerName,
      'echo "Container stopped"'
    ];
    
    try {
      const sendCommand = new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: commands
        }
      });
      
      const response = await ssm.send(sendCommand);
      const commandId = response.Command.CommandId;
      
      await this.waitForCommandCompletion(ssm, commandId, instanceId);
      
      return { success: true };
    } catch (error) {
      console.error('Error stopping container:', error);
      throw new Error(`Failed to stop container: ${error.message}`);
    }
  }

  async startContainer(credentials, region, instanceId, containerName) {
    const ssm = this.getSSMClient(credentials, region);
    
    const commands = [
      'sudo docker start ' + containerName,
      'echo "Container started"'
    ];
    
    try {
      const sendCommand = new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: commands
        }
      });
      
      const response = await ssm.send(sendCommand);
      const commandId = response.Command.CommandId;
      
      await this.waitForCommandCompletion(ssm, commandId, instanceId);
      
      return { success: true };
    } catch (error) {
      console.error('Error starting container:', error);
      throw new Error(`Failed to start container: ${error.message}`);
    }
  }

  async diagnoseApplication(credentials, region, instanceId, containerName, port) {
    const ssm = this.getSSMClient(credentials, region);
    
    const commands = [
      '#!/bin/bash',
      'echo "=== DIAGNOSTIC REPORT ==="',
      'echo "Timestamp: $(date)"',
      'echo "Instance ID: ' + instanceId + '"',
      'echo "Container: ' + containerName + '"',
      'echo "Port: ' + port + '"',
      'echo ""',
      
      '# 1. Check if Docker is running',
      'echo "1. DOCKER SERVICE STATUS:"',
      'sudo systemctl status docker --no-pager || sudo service docker status',
      'echo ""',
      
      '# 2. Check container status',
      'echo "2. CONTAINER STATUS:"',
      'sudo docker ps -a --filter name=' + containerName,
      'echo ""',
      
      '# 3. Check container logs',
      'echo "3. CONTAINER LOGS (last 20 lines):"',
      'sudo docker logs --tail 20 ' + containerName + ' 2>&1 || echo "No logs available"',
      'echo ""',
      
      '# 4. Check if port is listening',
      'echo "4. PORT LISTENING CHECK:"',
      'sudo netstat -tlnp | grep :' + port + ' || echo "Port ' + port + ' not listening"',
      'echo ""',
      
      '# 5. Check container port mapping',
      'echo "5. CONTAINER PORT MAPPING:"',
      'sudo docker port ' + containerName + ' || echo "No port mappings"',
      'echo ""',
      
      '# 6. Test local connectivity',
      'echo "6. LOCAL CONNECTIVITY TEST:"',
      'curl -s --connect-timeout 5 http://localhost:' + port + ' | head -5 || echo "Cannot connect to localhost:' + port + '"',
      'echo ""',
      
      '# 7. Check network interfaces',
      'echo "7. NETWORK INTERFACE INFO:"',
      'ip addr show | grep -E "(inet |UP)" || ifconfig',
      'echo ""',
      
      '# 8. Check if container is actually running',
      'echo "8. CONTAINER PROCESS CHECK:"',
      'sudo docker inspect ' + containerName + ' --format="{{.State.Status}}: {{.State.Running}}" || echo "Container not found"',
      'echo ""',
      
      'echo "=== END DIAGNOSTIC REPORT ==="'
    ];
    
    try {
      console.log('🔍 Running comprehensive diagnostic...');
      
      const sendCommand = new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: commands
        },
        TimeoutSeconds: 300
      });
      
      const response = await ssm.send(sendCommand);
      const commandId = response.Command.CommandId;
      
      await this.waitForCommandCompletion(ssm, commandId, instanceId);
      const output = await this.getCommandOutput(ssm, commandId, instanceId);
      
      return {
        success: true,
        diagnosticReport: output
      };
      
    } catch (error) {
      console.error('❌ Diagnostic failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async fixContainer(credentials, region, instanceId, containerName, dockerImage, port) {
    const ssm = this.getSSMClient(credentials, region);
    
    const commands = [
      '#!/bin/bash',
      'set -e',
      'echo "=== CONTAINER FIX STARTED ==="',
      'echo "Container: ' + containerName + '"',
      'echo "Image: ' + dockerImage + '"',
      'echo "Port: ' + port + '"',
      'echo ""',
      
      '# 1. Stop and remove existing container',
      'echo "1. Stopping existing container..."',
      'sudo docker stop ' + containerName + ' 2>/dev/null || echo "Container was not running"',
      'sudo docker rm ' + containerName + ' 2>/dev/null || echo "Container did not exist"',
      'echo ""',
      
      '# 2. Pull latest image',
      'echo "2. Pulling latest image..."',
      'sudo docker pull ' + dockerImage,
      'echo ""',
      
      '# 3. Start Docker service',
      'echo "3. Ensuring Docker service is running..."',
      'sudo systemctl start docker 2>/dev/null || sudo service docker start',
      'echo ""',
      
      '# 4. Run new container with port 3000:3000 mapping only',
      'echo "4. Starting new container with port ' + port + ':' + port + ' mapping..."',
      'sudo docker run -d \\',
      '  --name ' + containerName + ' \\',
      '  --restart unless-stopped \\',
      '  -p ' + port + ':' + port + ' \\',
      '  -e PORT=' + port + ' \\',
      '  ' + dockerImage,
      'echo ""',
      
      '# 5. Wait for container to start',
      'echo "5. Waiting for container to start..."',
      'sleep 10',
      'echo ""',
      
      '# 6. Verify container is running',
      'echo "6. Verifying container status..."',
      'CONTAINER_STATUS=$(sudo docker ps --filter name=' + containerName + ' --format "{{.Status}}")',
      'if [ -n "$CONTAINER_STATUS" ]; then',
      '    echo "✅ Container is running: $CONTAINER_STATUS"',
      '    sudo docker ps --filter name=' + containerName,
      'else',
      '    echo "❌ Container failed to start"',
      '    sudo docker ps -a --filter name=' + containerName,
      '    echo "Container logs:"',
      '    sudo docker logs ' + containerName,
      '    exit 1',
      'fi',
      'echo ""',
      
      '# 7. Test port connectivity with multiple attempts',
      'echo "7. Testing port connectivity..."',
      'for i in {1..6}; do',
      '    echo "Attempt $i/6: Testing http://localhost:' + port + '"',
      '    if curl -s --connect-timeout 5 http://localhost:' + port + ' >/dev/null 2>&1; then',
      '        echo "✅ Application is responding on port ' + port + '"',
      '        break',
      '    elif curl -s --connect-timeout 5 http://localhost:' + port + '/health >/dev/null 2>&1; then',
      '        echo "✅ Application health check responding on port ' + port + '"',
      '        break',
      '    else',
      '        echo "⏳ Waiting for application to start... (${i}/6)"',
      '        if [ $i -eq 6 ]; then',
      '            echo "❌ Application not responding after 30 seconds"',
      '            echo "Container logs (last 30 lines):"',
      '            sudo docker logs --tail 30 ' + containerName,
      '            echo ""',
      '            echo "Application failed to start - check container logs above"',
      '        else',
      '            sleep 5',
      '        fi',
      '    fi',
      'done',
      'echo ""',
      
      '# 8. Show final status',
      'echo "8. Final status check..."',
      'echo "Container status:"',
      'sudo docker ps --filter name=' + containerName,
      'echo ""',
      'echo "Port mapping:"',
      'sudo docker port ' + containerName + ' || echo "No port mappings found"',
      'echo ""',
      'echo "Network listening:"',
      'sudo netstat -tlnp | grep :' + port + ' || echo "Port ' + port + ' not listening"',
      'echo ""',
      
      'echo "=== CONTAINER FIX COMPLETED ==="',
      'echo "Container: ' + containerName + '"',
      'echo "Status: Running"',
      'echo "Port: ' + port + '"',
      'PUBLIC_IP=$(curl -s --connect-timeout 5 http://169.254.169.254/latest/meta-data/public-ipv4 || echo "unknown")',
      'echo "Access URL: http://$PUBLIC_IP:' + port + '"'
    ];
    
    try {
      console.log('🔧 Running container fix...');
      
      const sendCommand = new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: commands
        },
        TimeoutSeconds: 600
      });
      
      const response = await ssm.send(sendCommand);
      const commandId = response.Command.CommandId;
      
      await this.waitForCommandCompletion(ssm, commandId, instanceId);
      const output = await this.getCommandOutput(ssm, commandId, instanceId);
      
      return {
        success: true,
        output: output
      };
      
    } catch (error) {
      console.error('❌ Container fix failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new EC2DockerService();
