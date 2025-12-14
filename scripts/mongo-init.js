// MongoDB initialization script for Docker
// This script runs when MongoDB container starts for the first time

// Switch to the radynamics database
db = db.getSiblingDB('radynamics');

// Create application user
db.createUser({
  user: 'radynamics_user',
  pwd: 'radynamics_password',
  roles: [
    {
      role: 'readWrite',
      db: 'radynamics'
    }
  ]
});

// Create collections with indexes
db.createCollection('users');
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ organizationId: 1 });

db.createCollection('organizations');
db.organizations.createIndex({ slug: 1 }, { unique: true });
db.organizations.createIndex({ ownerId: 1 });

db.createCollection('awsaccounts');
db.awsaccounts.createIndex({ userId: 1 });
db.awsaccounts.createIndex({ organizationId: 1 });

db.createCollection('deployments');
db.deployments.createIndex({ userId: 1 });
db.deployments.createIndex({ awsAccountId: 1 });
db.deployments.createIndex({ status: 1 });
db.deployments.createIndex({ createdAt: -1 });

db.createCollection('otps');
db.otps.createIndex({ email: 1, type: 1 });
db.otps.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

db.createCollection('auditlogs');
db.auditlogs.createIndex({ userId: 1 });
db.auditlogs.createIndex({ timestamp: -1 });

db.createCollection('notifications');
db.notifications.createIndex({ userId: 1 });
db.notifications.createIndex({ read: 1 });
db.notifications.createIndex({ createdAt: -1 });

print('MongoDB initialization completed for RaDynamics database');