import React from 'react';
import { FEE_STATUS_VALUES } from '../../../../utils/studentAdminValidation';

const StudentsControlsBar = ({
    searchTerm,
    setSearchTerm,
    filterStatus,
    setFilterStatus,
    filterFeeStatus,
    setFilterFeeStatus,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    handleManualRefresh,
    downloadStudentsDataCsv,
}) => (
    <div className="controls-bar">
        <div className="search-box">
            <i className="fas fa-search"></i>
            <input
                type="text"
                placeholder="Search by student name, Student ID, email, phone, or course..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>

        <div className="filter-controls">
            <select
                className="status-filter"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
            >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="completed">Completed</option>
            </select>

            <select
                className="status-filter"
                value={filterFeeStatus}
                onChange={(e) => setFilterFeeStatus(e.target.value)}
                aria-label="Filter by fee status"
            >
                <option value="all">All fee status</option>
                {FEE_STATUS_VALUES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                ))}
            </select>

            <select
                className="status-filter students-sort-select"
                value={`${sortBy}:${sortOrder}`}
                onChange={(e) => {
                    const [nextBy, nextOrder] = String(e.target.value).split(':');
                    setSortBy(nextBy === 'student' ? 'student' : 'studentId');
                    setSortOrder(nextOrder === 'desc' ? 'desc' : 'asc');
                }}
                aria-label="Sort students"
                title="Rearrange student cards"
            >
                <option value="studentId:asc">Roll number ↑</option>
                <option value="studentId:desc">Roll number ↓</option>
                <option value="student:asc">Name A–Z</option>
                <option value="student:desc">Name Z–A</option>
            </select>

            <button className="refresh-btn" onClick={handleManualRefresh} type="button" title="Refresh" aria-label="Refresh">
                <i className="fas fa-sync-alt"></i>
            </button>

            <button className="btn-secondary download-btn" onClick={downloadStudentsDataCsv}>
                <i className="fas fa-file-export"></i> Download CSV
            </button>
        </div>
    </div>
);

export default StudentsControlsBar;
