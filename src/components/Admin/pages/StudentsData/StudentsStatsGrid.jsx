import React from 'react';

const StudentsStatsGrid = ({ stats }) => (
    <div className="stats-grid">
        <div className="stat-card total">
            <div className="stat-icon">
                <i className="fas fa-user-graduate"></i>
            </div>
            <div className="stat-info">
                <h3>{stats.uniqueStudents || stats.totalStudentAccounts || 0}</h3>
                <p>Students</p>
            </div>
        </div>
        <div className="stat-card active">
            <div className="stat-icon">
                <i className="fas fa-table"></i>
            </div>
            <div className="stat-info">
                <h3>{stats.totalRows}</h3>
                <p>Enrolled courses</p>
            </div>
        </div>
        <div className="stat-card inactive">
            <div className="stat-icon">
                <i className="fas fa-chart-line"></i>
            </div>
            <div className="stat-info">
                <h3>{stats.activeRows}</h3>
                <p>Active enrolled courses</p>
            </div>
        </div>
        <div className="stat-card completed">
            <div className="stat-icon">
                <i className="fas fa-pause-circle"></i>
            </div>
            <div className="stat-info">
                <h3>{stats.inactiveRows}</h3>
                <p>Inactive enrolled courses</p>
            </div>
        </div>
    </div>
);

export default StudentsStatsGrid;
