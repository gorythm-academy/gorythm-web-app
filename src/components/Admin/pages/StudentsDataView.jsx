import AddStudentUnifiedModal from './AddStudentUnifiedModal';
import EnrollStudentModal from './EnrollStudentModal';
import EditEnrollmentModal from './EditEnrollmentModal';
import StudentDetailOverlay from './StudentDetailOverlay';
import StudentCard from './StudentsData/StudentCard';
import StudentsControlsBar from './StudentsData/StudentsControlsBar';
import StudentsPagination from './StudentsData/StudentsPagination';
import StudentsStatsGrid from './StudentsData/StudentsStatsGrid';
import { ACTIVE_RECORDS_LABEL, QUARANTINE_COURSES_LABEL, QUARANTINE_STUDENTS_LABEL } from '../../../utils/adminListLabels';

export function StudentsDataView({ state }) {
  const {
    showAddModal,
    setShowAddModal,
    handleAddStudentSuccess,
    courses,
    showEnrollModal,
    setShowEnrollModal,
    setEnrollPreselectedStudent,
    handleEnrollExistingSuccess,
    enrollPreselectedStudent,
    detailEnrollments,
    showEditModal,
    editMode,
    editingEnrollment,
    setShowEditModal,
    setEditingEnrollment,
    handleEditSaved,
    handleLoginEmailUpdated,
    detailStudent,
    detailTab,
    setDetailTab,
    detailLoading,
    detailRefreshing,
    trashBusy,
    detailQuarantineCount,
    listTab,
    closeStudentDetail,
    handleAddCourseToStudent,
    handleEditEnrollment,
    handleEditAccount,
    handleQuarantineEnrollment,
    handleQuarantineStudent,
    handleRestoreStudent,
    handlePermanentDeleteStudent,
    handleRestoreEnrollment,
    handlePermanentDelete,
    updateEnrollmentStatus,
    stats,
    trashStudentsCount,
    trashCount,
    handleAddStudent,
    errorMessage,
    setErrorMessage,
    successMessage,
    setSuccessMessage,
    setListTab,
    setFilterStatus,
    setFilterFeeStatus,
    searchTerm,
    setSearchTerm,
    filterStatus,
    filterFeeStatus,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    handleManualRefresh,
    downloadStudentsDataCsv,
    loading,
    studentCards,
    openStudentDetail,
    page,
    setPage,
    total,
    totalPages,
    PAGE_SIZE,
  } = state;

  return (
<div className="students-data-page">
            <AddStudentUnifiedModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onSuccess={handleAddStudentSuccess}
                courses={courses}
            />

            <EnrollStudentModal
                isOpen={showEnrollModal}
                onClose={() => {
                    setShowEnrollModal(false);
                    setEnrollPreselectedStudent(null);
                }}
                onEnrollSuccess={handleEnrollExistingSuccess}
                courses={courses}
                preselectedStudent={enrollPreselectedStudent}
                defaultsFromEnrollment={
                    enrollPreselectedStudent
                        ? (detailEnrollments.find((e) => e.course?._id) || detailEnrollments[0] || null)
                        : null
                }
            />

            <EditEnrollmentModal
                isOpen={showEditModal}
                mode={editMode}
                enrollment={editingEnrollment}
                onClose={() => {
                    setShowEditModal(false);
                    setEditingEnrollment(null);
                }}
                onSaved={handleEditSaved}
                onLoginEmailUpdated={handleLoginEmailUpdated}
            />

            <StudentDetailOverlay
                student={detailStudent}
                detailTab={detailTab}
                onDetailTabChange={setDetailTab}
                enrollments={detailEnrollments}
                loading={detailLoading}
                refreshing={detailRefreshing}
                trashBusy={trashBusy}
                quarantineCount={detailQuarantineCount}
                studentQuarantined={Boolean(detailStudent?.deletedAt) || listTab === 'trashStudents'}
                onClose={closeStudentDetail}
                onAddCourse={handleAddCourseToStudent}
                onEditEnrollment={handleEditEnrollment}
                onEditAccount={handleEditAccount}
                onQuarantineEnrollment={handleQuarantineEnrollment}
                onQuarantineStudent={() => handleQuarantineStudent(detailStudent)}
                onRestoreStudent={() => handleRestoreStudent(detailStudent)}
                onPermanentDeleteStudent={() => handlePermanentDeleteStudent(detailStudent)}
                onRestoreEnrollment={handleRestoreEnrollment}
                onPermanentDelete={handlePermanentDelete}
                onUpdateStatus={updateEnrollmentStatus}
                blockEscape={showEnrollModal || showEditModal}
            />

            <div className="page-header">
                <div className="header-left">
                    <h1><i className="fas fa-user-graduate"></i> Students</h1>
                    <p>
                        Accounts, enrollments, fee status, and course assignments in one place
                        {listTab === 'active'
                            ? ` · ${stats.uniqueStudents || stats.totalStudentAccounts || 0} students`
                            : listTab === 'trashStudents'
                                ? ` · ${QUARANTINE_STUDENTS_LABEL}`
                                : ` · ${QUARANTINE_COURSES_LABEL}`}
                    </p>
                    <small>
                        <i className="fas fa-database" aria-hidden="true" />
                        Data stored in MongoDB | {listTab === 'active'
                            ? `${stats.totalRows} enrolled courses`
                            : listTab === 'trashStudents'
                                ? `${trashStudentsCount} quarantined students`
                                : `${trashCount} students with quarantined courses`}
                    </small>
                </div>
                {listTab === 'active' ? (
                    <div className="header-right">
                        <button type="button" className="btn-primary btn-add" onClick={handleAddStudent}>
                            <i className="fas fa-user-plus"></i> Add new student
                        </button>
                    </div>
                ) : null}
            </div>

            {errorMessage && (
                <div className="alert alert-error">
                    <i className="fas fa-exclamation-circle"></i>
                    {errorMessage}
                    <button onClick={() => setErrorMessage('')} className="alert-close">×</button>
                </div>
            )}

            {successMessage && (
                <div className="alert alert-success">
                    <i className="fas fa-check-circle"></i>
                    {successMessage}
                    <button onClick={() => setSuccessMessage('')} className="alert-close">×</button>
                </div>
            )}

            {listTab === 'active' && <StudentsStatsGrid stats={stats} />}

            <div className="students-list-tabs">
                <button
                    type="button"
                    className={`students-list-tab ${listTab === 'active' ? 'active' : ''}`}
                    onClick={() => setListTab('active')}
                >
                    <i className="fas fa-list" /> {ACTIVE_RECORDS_LABEL}
                </button>
                <button
                    type="button"
                    className={`students-list-tab students-list-tab--trash ${listTab === 'trash' ? 'active' : ''}`}
                    onClick={() => {
                        setFilterStatus('all');
                        setFilterFeeStatus('all');
                        setListTab('trash');
                    }}
                >
                    <i className="fas fa-book" /> {QUARANTINE_COURSES_LABEL} ({trashCount})
                </button>
                <button
                    type="button"
                    className={`students-list-tab students-list-tab--trash ${listTab === 'trashStudents' ? 'active' : ''}`}
                    onClick={() => {
                        setFilterStatus('all');
                        setFilterFeeStatus('all');
                        setListTab('trashStudents');
                    }}
                >
                    <i className="fas fa-user-slash" /> {QUARANTINE_STUDENTS_LABEL} ({trashStudentsCount})
                </button>
            </div>

            <StudentsControlsBar
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                filterStatus={filterStatus}
                setFilterStatus={setFilterStatus}
                filterFeeStatus={filterFeeStatus}
                setFilterFeeStatus={setFilterFeeStatus}
                sortBy={sortBy}
                setSortBy={setSortBy}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
                handleManualRefresh={handleManualRefresh}
                downloadStudentsDataCsv={downloadStudentsDataCsv}
            />

            {loading && studentCards.length > 0 ? (
                <div className="students-cards-loading" aria-live="polite">
                    <i className="fas fa-spinner fa-spin" aria-hidden /> Refreshing…
                </div>
                    ) : null}

            {studentCards.length > 0 ? (
                <div className="students-cards-grid">
                    {studentCards.map((card) => (
                        <StudentCard
                            key={card.key}
                            card={card}
                            onOpen={openStudentDetail}
                        />
                    ))}
                                                </div>
            ) : loading ? (
                <div className="students-cards-grid students-cards-grid--skeleton" aria-hidden>
                    {Array.from({ length: PAGE_SIZE }, (_, i) => (
                        <div key={i} className="student-card-skeleton" />
                    ))}
                                            </div>
            ) : (
                <div className="students-cards-empty">
                    <i className="fas fa-user-graduate" aria-hidden />
                    <p><strong>No students found.</strong></p>
                                        <p className="no-data-hint">
                        {listTab === 'trash'
                            ? 'No students with quarantined courses.'
                            : listTab === 'trashStudents'
                                ? 'No quarantined students. Use Quarantine student from a student card to archive a whole account.'
                                : 'Use Add new student to create a record. Add more courses from a student card.'}
                                        </p>
                                        {listTab === 'active' ? (
                                            <div className="no-data-actions">
                            <button type="button" className="btn-primary btn-add" onClick={handleAddStudent}>
                                <i className="fas fa-user-plus"></i> Add new student
                                                </button>
                                            </div>
                                        ) : null}
                                    </div>
                        )}

            <StudentsPagination
                page={page}
                setPage={setPage}
                loading={loading}
                total={total}
                totalPages={totalPages}
            />

            <div className="database-info">
                <div className="info-card">
                    <i className="fas fa-database"></i>
                    <div>
                        <h4>MongoDB Storage</h4>
                        <p>All student records are stored permanently in MongoDB</p>
                        <small>
                            Enrollment rows: {stats.totalRows} | Unique students: {stats.uniqueStudents}
                        </small>
                    </div>
                </div>
                <div className="info-card">
                    <i className="fas fa-sync-alt"></i>
                    <div>
                        <h4>Auto Refresh</h4>
                        <p>Data persists after page refresh</p>
                        <small>Changes saved to database</small>
                    </div>
                </div>
            </div>
        </div>
  );
}
