const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    targetType: { type: String, default: '' },
    targetId: { type: String, default: '' },
    details: { type: Object, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
