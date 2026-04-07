const AuditLog = require('../models/AuditLog');

const logAudit = async ({ actor, action, targetType, targetId, details }) => {
  try {
    if (!actor || !action) return;
    await AuditLog.create({
      actor,
      action,
      targetType: targetType || '',
      targetId: targetId || '',
      details: details || {},
    });
  } catch (error) {
    // Audit logging should not break main flow.
  }
};

module.exports = { logAudit };
