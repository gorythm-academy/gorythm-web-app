/** Shared attendance status values (teacher self + student class). */
const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'leave', 'holiday', 'weekend'];

/** No salary deduction for these (still shown in reports). */
const NON_DEDUCTIBLE_STATUSES = ['holiday', 'weekend'];

function isValidAttendanceStatus(status) {
    return ATTENDANCE_STATUSES.includes(status);
}

function isNonDeductibleStatus(status) {
    return NON_DEDUCTIBLE_STATUSES.includes(status);
}

module.exports = {
    ATTENDANCE_STATUSES,
    NON_DEDUCTIBLE_STATUSES,
    isValidAttendanceStatus,
    isNonDeductibleStatus,
};
