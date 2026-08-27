import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import '../Admin.scss';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const EMPTY_STATS = {
    totalStudents: 0,
    totalTeachers: 0,
    totalParents: 0,
    newStudentsInPeriod: 0,
    newTeachersInPeriod: 0,
    newParentsInPeriod: 0,
    publishedCourses: 0,
    periodRevenue: 0,
    activeUsers: 0,
    totalEnrollments: 0,
    completionRate: 0,
};

const EMPTY_METRICS = {
    enrollmentRate: '0%',
    completionRate: '0%',
    highProgressRate: '0%',
    revenueGrowth: '+0%',
    currentPeriodRevenue: 0,
    previousPeriodRevenue: 0,
    newStudentsInPeriod: 0,
};

const EMPTY_CHART_DATA = {
    enrollmentTrend: [],
    revenueData: [],
    categoryDistribution: [],
};

const EMPTY_CARD_TRENDS = {
    students: { value: '- 0 total', secondaryValue: '- 0 active (current)', direction: 'neutral' },
    courses: { value: '- 0 published • 0 draft', secondaryValue: '- 0 with enrollments this period', direction: 'neutral' },
    revenue: { value: 'Growth unavailable', direction: 'neutral' },
    activeUsers: { value: '- 0 active (current)', secondaryValue: '- 0 inactive (current)', direction: 'neutral' },
    teachers: { value: '- 0 total', secondaryValue: '- 0 active (current)', direction: 'neutral' },
    parents: { value: '- 0 total', secondaryValue: '- 0 active (current)', direction: 'neutral' },
};

const formatPercent = (value, withSign = false) => {
    const numeric = Number(value) || 0;
    const fixed = numeric.toFixed(1).replace(/\.0$/, '');
    if (withSign) {
        return `${numeric >= 0 ? '+' : ''}${fixed}%`;
    }
    return `${fixed}%`;
};

const formatSignedValue = (value, suffix = '%') => {
    const numeric = Number(value) || 0;
    const fixed = numeric.toFixed(1).replace(/\.0$/, '');
    return `${numeric >= 0 ? '+' : ''}${fixed}${suffix}`;
};

const parseGrowthPercent = (value) => {
    const cleaned = String(value || '0').replace(/[+%]/g, '');
    return Number(cleaned) || 0;
};

const formatPeriodLabel = (days) => (Number(days) === 365 ? '1 Year' : `Last ${days} Days`);

const formatPeriodPhrase = (days) => formatPeriodLabel(days).toLowerCase();

const getChartGroupingForDays = (days) => {
    const value = Number(days) || 30;
    if (value <= 31) return 'daily';
    if (value <= 90) return 'weekly';
    return 'monthly';
};

const buildRevenueTrend = (metrics) => {
    if (!metrics?.revenueGrowth) {
        return { value: 'Growth unavailable', direction: 'neutral' };
    }
    const revenueGrowthNumeric = parseGrowthPercent(metrics.revenueGrowth);
    return {
        value: formatSignedValue(revenueGrowthNumeric),
        direction: revenueGrowthNumeric >= 0 ? 'up' : 'down',
    };
};

const formatChartLabel = (date, grouping) => {
    if (!date) return '';
    const value = String(date);

    if (grouping === 'monthly') {
        const [year, month] = value.split('-');
        const monthIndex = Number(month) - 1;
        const monthLabel = MONTH_LABELS[monthIndex] || month;
        return `${monthLabel} '${String(year).slice(-2)}`;
    }

    if (grouping === 'weekly') {
        const [year, week] = value.split('-');
        return `W${week} '${String(year).slice(-2)}`;
    }

    return value.slice(5) || value;
};

const chartGroupingLabel = (grouping) => {
    if (grouping === 'monthly') return 'Monthly view';
    if (grouping === 'weekly') return 'Weekly view';
    return 'Daily view';
};

const SimpleBarChart = ({ data, valueKey, labelKey, emptyLabel }) => {
    if (!data?.length) {
        return <div className="analytics-chart-empty">{emptyLabel}</div>;
    }

    const maxValue = Math.max(...data.map((item) => Number(item[valueKey]) || 0), 1);

    return (
        <div className="analytics-bar-chart">
            {data.map((item, index) => {
                const value = Number(item[valueKey]) || 0;
                const height = `${Math.max((value / maxValue) * 100, value > 0 ? 8 : 0)}%`;
                return (
                    <div key={`${item[labelKey]}-${index}`} className="analytics-bar-item">
                        <div className="analytics-bar-track">
                            <div
                                className="analytics-bar-fill"
                                style={{ height }}
                                title={`${item[labelKey]}: ${value.toLocaleString()}`}
                            />
                        </div>
                        <span className="analytics-bar-label">{item[labelKey]}</span>
                        <span className="analytics-bar-value">{value.toLocaleString()}</span>
                    </div>
                );
            })}
        </div>
    );
};

const Analytics = () => {
    const navigate = useNavigate();
    const hasLoadedRef = useRef(false);
    const [stats, setStats] = useState(EMPTY_STATS);
    const [recentEnrollments, setRecentEnrollments] = useState([]);
    const [courseStats, setCourseStats] = useState([]);
    const [chartData, setChartData] = useState(EMPTY_CHART_DATA);
    const [chartGrouping, setChartGrouping] = useState('daily');
    const [initialLoading, setInitialLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [fetchError, setFetchError] = useState('');
    const [fetchWarnings, setFetchWarnings] = useState([]);
    const [timeFilter, setTimeFilter] = useState('30');
    const [insights, setInsights] = useState([]);
    const [cardTrends, setCardTrends] = useState(EMPTY_CARD_TRENDS);
    const [performanceMetrics, setPerformanceMetrics] = useState(EMPTY_METRICS);
    const [metricsUnavailable, setMetricsUnavailable] = useState(false);

    const buildCurrentRoleTrend = (roleStats, totalCount) => ({
        value: `- ${(totalCount || 0).toLocaleString()} total`,
        secondaryValue: `- ${roleStats?.active || 0} active (current)`,
        direction: 'neutral',
    });

    const fetchAnalyticsData = useCallback(async () => {
        const isInitial = !hasLoadedRef.current;

        try {
            if (isInitial) {
                setInitialLoading(true);
            } else {
                setRefreshing(true);
            }
            setFetchError('');
            setFetchWarnings([]);
            setMetricsUnavailable(false);

            const token = getAuthToken();
            const headers = { Authorization: `Bearer ${token}` };
            const daysParams = { days: timeFilter };

            const [overviewResult, metricsResult] = await Promise.allSettled([
                axios.get(`${API_BASE_URL}/api/analytics/overview`, { headers, params: daysParams }),
                axios.get(`${API_BASE_URL}/api/analytics/metrics`, { headers, params: daysParams }),
            ]);

            const warnings = [];

            const overviewFailed = overviewResult.status === 'rejected'
                || (overviewResult.status === 'fulfilled' && !overviewResult.value.data?.success);
            const metricsFailed = metricsResult.status === 'rejected'
                || (metricsResult.status === 'fulfilled' && !metricsResult.value.data?.success);

            if (overviewFailed) {
                const overviewError = overviewResult.status === 'rejected'
                    ? overviewResult.reason
                    : null;
                if (overviewError?.response?.status === 401) {
                    window.location.assign('/admin/login');
                    return;
                }
                warnings.push(
                    overviewError?.response?.data?.error
                    || overviewResult.value?.data?.error
                    || 'Failed to load analytics overview.'
                );
                setStats(EMPTY_STATS);
                setRecentEnrollments([]);
                setCourseStats([]);
                setChartData(EMPTY_CHART_DATA);
                setInsights([]);
                setCardTrends(EMPTY_CARD_TRENDS);
                setChartGrouping(getChartGroupingForDays(timeFilter));
            }

            if (metricsFailed) {
                const metricsError = metricsResult.status === 'rejected'
                    ? metricsResult.reason
                    : null;
                if (metricsError?.response?.status === 401) {
                    window.location.assign('/admin/login');
                    return;
                }
                warnings.push(
                    metricsError?.response?.data?.error
                    || metricsResult.value?.data?.error
                    || 'Failed to load performance metrics.'
                );
                setMetricsUnavailable(true);
            }

            const overviewPayload = !overviewFailed && overviewResult.status === 'fulfilled'
                ? overviewResult.value.data
                : null;
            const overviewData = overviewPayload?.success ? overviewPayload.data : null;
            const grouping = overviewPayload?.chartGrouping || 'daily';

            const metricsPayload = !metricsFailed && metricsResult.status === 'fulfilled'
                ? metricsResult.value.data
                : null;
            const metrics = metricsPayload?.success ? metricsPayload.metrics : null;

            if (!overviewData && !metrics) {
                setFetchError(warnings.join(' ') || 'Failed to load analytics.');
                return;
            }

            if (warnings.length) {
                setFetchWarnings(warnings);
            }

            if (metrics) {
                setMetricsUnavailable(false);
                setPerformanceMetrics(metrics);
                if (!overviewData) {
                    setCardTrends((prev) => ({
                        ...prev,
                        revenue: buildRevenueTrend(metrics),
                    }));
                }
            }

            if (overviewData) {
                const summary = overviewData.summary || {};
                const roleActivity = summary.roleActivity || {};
                const periodPhrase = formatPeriodPhrase(timeFilter);
                const completionRate = Number(summary.completionRate) || 0;
                const periodEnrollments = summary.totalEnrollments || 0;
                const completionDenominator = summary.completionDenominator || periodEnrollments;
                const revenueGrowthNumeric = metrics ? parseGrowthPercent(metrics.revenueGrowth) : null;

                setStats({
                    totalStudents: summary.totalStudents || 0,
                    totalTeachers: summary.totalTeachers || 0,
                    totalParents: summary.totalParents || 0,
                    newStudentsInPeriod: summary.newStudentsInPeriod || 0,
                    newTeachersInPeriod: summary.newTeachersInPeriod || 0,
                    newParentsInPeriod: summary.newParentsInPeriod || 0,
                    publishedCourses: summary.publishedCourses || 0,
                    periodRevenue: summary.periodRevenue || 0,
                    activeUsers: summary.activeUsers || 0,
                    totalEnrollments: periodEnrollments,
                    completionRate,
                });

                setCardTrends({
                    students: buildCurrentRoleTrend(roleActivity.students, summary.totalStudents),
                    courses: {
                        value: `- ${summary.publishedCourses || 0} published • ${summary.draftCourses || 0} draft (current)`,
                        secondaryValue: `- ${summary.coursesWithEnrollments || 0} with enrollments • ${periodEnrollments} new this period`,
                        direction: 'neutral',
                    },
                    revenue: buildRevenueTrend(metrics),
                    activeUsers: {
                        value: `- ${roleActivity.staff?.active || 0} active (current)`,
                        secondaryValue: `- ${roleActivity.staff?.inactive || 0} inactive (current)`,
                        direction: 'neutral',
                    },
                    teachers: buildCurrentRoleTrend(roleActivity.teachers, summary.totalTeachers),
                    parents: buildCurrentRoleTrend(roleActivity.parents, summary.totalParents),
                });

                setRecentEnrollments(overviewData.recentEnrollments || []);
                setCourseStats(overviewData.topCourses || []);
                setChartGrouping(grouping);

                setChartData({
                    enrollmentTrend: (overviewData.enrollmentTrend || []).map((item) => ({
                        label: formatChartLabel(item.date, grouping),
                        value: item.enrollments || 0,
                    })),
                    revenueData: (overviewData.revenueData || []).map((item) => ({
                        label: formatChartLabel(item.date, grouping),
                        value: item.totalRevenue || 0,
                    })),
                    categoryDistribution: (overviewData.categoryDistribution || []).slice(0, 6).map((item) => ({
                        label: item._id || 'Other',
                        value: item.enrollmentCount || 0,
                    })),
                });

                const metricsCompletionRate = metrics?.completionRate || `${completionRate}%`;

                setInsights([
                    {
                        icon: 'fas fa-arrow-up insight-positive',
                        title: 'Student Growth',
                        text: metrics
                            ? `${summary.newStudentsInPeriod || 0} new students in ${periodPhrase} (${metrics.enrollmentRate} of all students).`
                            : `${summary.newStudentsInPeriod || 0} new students in ${periodPhrase}.`,
                    },
                    {
                        icon: 'fas fa-dollar-sign insight-revenue',
                        title: 'Revenue Trend',
                        text: metrics
                            ? `Revenue trend is ${formatPercent(revenueGrowthNumeric, true)} with $${(metrics.currentPeriodRevenue || 0).toLocaleString()} in this period vs $${(metrics.previousPeriodRevenue || 0).toLocaleString()} in the previous period.`
                            : `Period revenue is $${(summary.periodRevenue || 0).toLocaleString()} in ${periodPhrase}. Growth comparison is unavailable.`,
                    },
                    {
                        icon: 'fas fa-book insight-courses',
                        title: 'Course Engagement',
                        text: `Course completion rate is ${metricsCompletionRate} across ${completionDenominator.toLocaleString()} active enrollments in this period.`,
                    },
                    {
                        icon: 'fas fa-user-check insight-active',
                        title: 'Active Staff',
                        text: `${(summary.activeUsers || 0).toLocaleString()} active staff accounts (${roleActivity.staff?.inactive || 0} inactive, current snapshot).`,
                    },
                ]);
            }

            hasLoadedRef.current = true;
        } catch (error) {
            console.error('Analytics fetch error:', error);
            if (error.response?.status === 401) {
                window.location.assign('/admin/login');
                return;
            }
            setFetchError(error.response?.data?.error || error.message || 'Failed to load analytics.');
        } finally {
            setInitialLoading(false);
            setRefreshing(false);
        }
    }, [timeFilter]);

    useEffect(() => {
        fetchAnalyticsData();
    }, [fetchAnalyticsData]);

    const summaryCards = [
        {
            title: 'New Students',
            subtitle: 'This period',
            value: (stats?.newStudentsInPeriod || 0).toLocaleString(),
            icon: 'fas fa-users',
            color: 'var(--color-accent)',
            change: cardTrends.students.value,
            secondaryValue: cardTrends.students.secondaryValue,
            direction: cardTrends.students.direction,
            link: '/admin/students',
        },
        {
            title: 'Published Courses',
            subtitle: 'Current snapshot',
            value: stats?.publishedCourses || 0,
            icon: 'fas fa-book',
            color: '#10b981',
            change: cardTrends.courses.value,
            secondaryValue: cardTrends.courses.secondaryValue,
            direction: cardTrends.courses.direction,
            link: '/admin/courses',
        },
        {
            title: 'Period Revenue',
            subtitle: 'This period',
            value: `$${(stats?.periodRevenue || 0).toLocaleString()}`,
            icon: 'fas fa-dollar-sign',
            color: '#f59e0b',
            change: cardTrends.revenue.value,
            direction: cardTrends.revenue.direction,
            link: '/admin/payments',
        },
        {
            title: 'Active Staff',
            subtitle: 'Current snapshot',
            value: stats?.activeUsers || 0,
            icon: 'fas fa-user-check',
            color: '#8b5cf6',
            change: cardTrends.activeUsers.value,
            secondaryValue: cardTrends.activeUsers.secondaryValue,
            direction: cardTrends.activeUsers.direction,
            link: '/admin/users',
        },
        {
            title: 'New Teachers',
            subtitle: 'This period',
            value: (stats?.newTeachersInPeriod || 0).toLocaleString(),
            icon: 'fas fa-chalkboard-teacher',
            color: '#06b6d4',
            change: cardTrends.teachers.value,
            secondaryValue: cardTrends.teachers.secondaryValue,
            direction: cardTrends.teachers.direction,
            link: '/admin/teachers',
        },
        {
            title: 'New Parents',
            subtitle: 'This period',
            value: (stats?.newParentsInPeriod || 0).toLocaleString(),
            icon: 'fas fa-people-roof',
            color: '#f97316',
            change: cardTrends.parents.value,
            secondaryValue: cardTrends.parents.secondaryValue,
            direction: cardTrends.parents.direction,
            link: '/admin/parents',
        },
    ];

    const performanceMetricValue = (key) => (
        metricsUnavailable ? 'Unavailable' : performanceMetrics[key]
    );

    const performanceCards = [
        {
            title: 'Enrollment Rate',
            value: performanceMetricValue('enrollmentRate'),
            icon: 'fas fa-user-plus',
            color: '#06b6d4',
            description: metricsUnavailable ? 'Could not load metrics' : 'New students as share of total',
        },
        {
            title: 'Course Completion',
            value: performanceMetricValue('completionRate'),
            icon: 'fas fa-trophy',
            color: '#10b981',
            description: metricsUnavailable ? 'Could not load metrics' : 'Completions this period',
        },
        {
            title: 'High Progress Rate',
            value: performanceMetricValue('highProgressRate'),
            icon: 'fas fa-chart-line',
            color: '#f59e0b',
            description: metricsUnavailable ? 'Could not load metrics' : 'Active enrollments at 70%+ progress',
        },
        {
            title: 'Revenue Growth',
            value: performanceMetricValue('revenueGrowth'),
            icon: 'fas fa-chart-line',
            color: '#ef4444',
            description: metricsUnavailable ? 'Could not load metrics' : 'Change vs previous period',
        },
    ];

    if (initialLoading) {
        return (
            <div className="analytics-page loading">
                <div className="loading-spinner">
                    <div className="spinner"></div>
                    <p>Loading analytics...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`analytics-page${refreshing ? ' is-refreshing' : ''}`}>
            {fetchError ? <div className="admin-fetch-error" role="alert">{fetchError}</div> : null}
            {fetchWarnings.length > 0 ? (
                <div className="admin-fetch-warning" role="status">
                    {fetchWarnings.join(' ')}
                </div>
            ) : null}

            <div className="analytics-header">
                <div>
                    <h1><i className="fas fa-chart-bar"></i> Analytics Dashboard</h1>
                    <p>
                        Period metrics use {formatPeriodLabel(timeFilter).toLowerCase()}.
                        Staff and course totals show the current snapshot.
                    </p>
                </div>
                <div className="date-filter">
                    <span>{formatPeriodLabel(timeFilter)}</span>
                </div>
            </div>

            <div className="time-filter-buttons">
                <button
                    type="button"
                    className={timeFilter === '7' ? 'active' : ''}
                    onClick={() => setTimeFilter('7')}
                    disabled={refreshing}
                >
                    7 Days
                </button>
                <button
                    type="button"
                    className={timeFilter === '30' ? 'active' : ''}
                    onClick={() => setTimeFilter('30')}
                    disabled={refreshing}
                >
                    30 Days
                </button>
                <button
                    type="button"
                    className={timeFilter === '90' ? 'active' : ''}
                    onClick={() => setTimeFilter('90')}
                    disabled={refreshing}
                >
                    90 Days
                </button>
                <button
                    type="button"
                    className={timeFilter === '365' ? 'active' : ''}
                    onClick={() => setTimeFilter('365')}
                    disabled={refreshing}
                >
                    1 Year
                </button>
            </div>

            {refreshing ? (
                <div className="analytics-refresh-banner" role="status">
                    <span className="spinner spinner-sm" />
                    Updating analytics...
                </div>
            ) : null}

            <div className="stats-grid">
                {summaryCards.map((card) => (
                    <div
                        key={card.title}
                        className="stat-card clickable"
                        onClick={() => navigate(card.link)}
                    >
                        <div className="stat-icon" style={{ background: card.color }}>
                            <i className={card.icon}></i>
                        </div>
                        <div className="stat-info">
                            <h3>{card.value}</h3>
                            <p>{card.title}</p>
                            {card.subtitle ? <small className="stat-subtitle">{card.subtitle}</small> : null}
                            <div className="trend-badge">
                                {card.direction !== 'neutral' ? (
                                    <i className={`fas ${card.direction === 'down' ? 'fa-arrow-down' : 'fa-arrow-up'}`}></i>
                                ) : null}
                                <span>
                                    {card.change}
                                    {card.secondaryValue ? <><br />{card.secondaryValue}</> : null}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="dashboard-card">
                <div className="card-header">
                    <h3><i className="fas fa-chart-area"></i> Trends</h3>
                    <span className="analytics-chart-grouping">
                        {chartGroupingLabel(chartGrouping)}
                    </span>
                </div>
                <div className="card-body analytics-charts-grid">
                    <div className="analytics-chart-panel">
                        <h4>Enrollments</h4>
                        <SimpleBarChart
                            data={chartData.enrollmentTrend}
                            valueKey="value"
                            labelKey="label"
                            emptyLabel="No enrollments in this period"
                        />
                    </div>
                    <div className="analytics-chart-panel">
                        <h4>Revenue</h4>
                        <SimpleBarChart
                            data={chartData.revenueData}
                            valueKey="value"
                            labelKey="label"
                            emptyLabel="No revenue in this period"
                        />
                    </div>
                    <div className="analytics-chart-panel">
                        <h4>Enrollments by Category</h4>
                        <SimpleBarChart
                            data={chartData.categoryDistribution}
                            valueKey="value"
                            labelKey="label"
                            emptyLabel="No category data in this period"
                        />
                    </div>
                </div>
            </div>

            <div className="dashboard-card">
                <div className="card-header">
                    <h3><i className="fas fa-tachometer-alt"></i> Performance Metrics</h3>
                    {metricsUnavailable ? (
                        <span className="analytics-metrics-unavailable">Data unavailable</span>
                    ) : null}
                </div>
                <div className="card-body">
                    <div className="metrics-grid">
                        {performanceCards.map((metric) => (
                            <div key={metric.title} className={`metric-card${metricsUnavailable ? ' metric-card--unavailable' : ''}`}>
                                <div className="metric-icon" style={{ color: metric.color }}>
                                    <i className={metric.icon}></i>
                                </div>
                                <div className="metric-content">
                                    <h4>{metric.value}</h4>
                                    <p>{metric.title}</p>
                                    <small>{metric.description}</small>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="dashboard-grid">
                <div className="dashboard-card">
                    <div className="card-header">
                        <h3><i className="fas fa-history"></i> Recent Enrollments</h3>
                        <button type="button" className="view-all" onClick={() => navigate('/admin/students')}>
                            View All
                        </button>
                    </div>
                    <div className="card-body">
                        {recentEnrollments.length > 0 ? (
                            <div className="activities-list">
                                {recentEnrollments.map((enrollment) => (
                                    <div key={enrollment._id} className="activity-item">
                                        <div className="activity-icon">
                                            <i className="fas fa-user-graduate"></i>
                                        </div>
                                        <div className="activity-content">
                                            <p><strong>New enrollment</strong></p>
                                            <span className="activity-time">
                                                {enrollment.course?.title || 'Unknown course'} • {enrollment.student?.name || 'Unknown student'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-state">
                                <i className="fas fa-user-graduate"></i>
                                <p>No enrollments in this period</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="dashboard-card">
                    <div className="card-header">
                        <h3><i className="fas fa-book"></i> Top Courses</h3>
                        <button type="button" className="view-all" onClick={() => navigate('/admin/courses')}>
                            View All
                        </button>
                    </div>
                    <div className="card-body">
                        {courseStats.length > 0 ? (
                            <div className="courses-list">
                                {courseStats.map((course) => (
                                    <div key={course._id || course.title} className="course-item">
                                        <div className="course-icon">
                                            <i className="fas fa-book-open"></i>
                                        </div>
                                        <div className="course-content">
                                            <h4>{course.title}</h4>
                                            <div className="course-meta">
                                                <span>
                                                    <i className="fas fa-users"></i>
                                                    {Number(course.students) || 0} enrollments this period
                                                </span>
                                                <span>
                                                    <i className="fas fa-dollar-sign"></i>
                                                    ${course.price || 0}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="course-status">
                                            <span className={`status-badge ${course.status === 'published' ? 'published' : 'draft'}`}>
                                                {course.status === 'published' ? 'Published' : 'Draft'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-state">
                                <i className="fas fa-book"></i>
                                <p>No course enrollments in this period</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="dashboard-card">
                <div className="card-header">
                    <h3><i className="fas fa-lightbulb"></i> Quick Insights</h3>
                </div>
                <div className="card-body">
                    <div className="insights-grid">
                        {insights.map((insight) => (
                            <div key={insight.title} className="insight-card">
                                <i className={insight.icon}></i>
                                <div>
                                    <h4>{insight.title}</h4>
                                    <p>{insight.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
