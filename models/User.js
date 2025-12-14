import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
     match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: true,
     minlength: [6, 'Password must be at least 6 characters']
  },
  name: {
    type: String,
    default: ''
  },
  profilePhoto: {
    type: String,
    default: ''
  },
  
  // Organization Support
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },
  defaultOrganizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization'
  },
  
  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});
userSchema.index({ email: 1, emailVerified: 1 });
export default mongoose.model('User', userSchema);
