import { teacherAccountStatus } from '../../../utils/teacherAccountStatus';

/** Account label shown beside a teacher name. */
export default function TeacherAccountStatus({ teacher, quarantined = false }) {
  if (!teacher) return null;
  const status = teacherAccountStatus(teacher, { quarantined });
  return (
    <span className={`lms-teacher-account-status lms-teacher-account-status--${status}`}>
      {status}
    </span>
  );
}
