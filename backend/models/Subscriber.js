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
    /** Hash of the one-time link that turns updates back on. Never store the raw token. */
    resubscribeTokenHash: {
      type: String,
      default: '',
    },
    resubscribeTokenExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

subscriberSchema.methods.toJSON = function toJSON() {
  const doc = this.toObject();
  delete doc.resubscribeTokenHash;
  delete doc.resubscribeTokenExpires;
  return doc;
};

module.exports = mongoose.model('Subscriber', subscriberSchema);
