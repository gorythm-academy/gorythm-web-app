const mongoose = require('mongoose');

const subscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    source: {
      type: String,
      trim: true,
      default: 'unknown',
    },
    unsubscribeToken: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    unsubscribedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Subscriber', subscriberSchema);
