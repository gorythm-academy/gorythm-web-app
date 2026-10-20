import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { teacherAccountStatus } from '../../../utils/teacherAccountStatus';
import { normalizeStaffStatus } from './usersManagementShared';

export async function downloadUsersCsv({
    variant,
    variantConfig,
    debouncedSearchTerm,
    sortBy,
    sortOrder,
    isStaffTab,
    filterRole,
    listTab,
    showAlert,
}) {
    try {
        const token = getAuthToken();
        const segment = variantConfig.segment;
        const allRows = [];
        let exportPage = 1;
        let exportTotal = 0;

        do {
            const response = await axios.get(`${API_BASE_URL}/api/users`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    segment,
                    page: exportPage,
                    limit: 500,
                    search: debouncedSearchTerm || undefined,
                    sortBy,
                    sortOrder,
                    ...(isStaffTab && filterRole !== 'all' ? { role: filterRole } : {}),
                    ...(listTab === 'trash' ? { trash: '1' } : {}),
                },
            });
            if (!response.data?.success) break;
            const batch = (response.data.users || []).filter((u) => variantConfig.roles.includes(u.role));
            allRows.push(...batch);
            exportTotal = Number(response.data.total) || batch.length;
            exportPage += 1;
        } while (allRows.length < exportTotal);

        const rows = allRows.map((u) => ({
            studentId: u.role === 'student' ? (u.studentId || '') : '',
            name: u.name || '',
            portalEmail: u.email || '',
            personalEmail: u.personalEmail || '',
            role: u.role || '',
            phone: u.phone || '',
            status: variant === 'teachers'
                ? teacherAccountStatus(u, { quarantined: listTab === 'trash' })
                : isStaffTab
                    ? normalizeStaffStatus(u.status)
                    : (u.status || (u.isActive !== false ? 'active' : 'inactive')),
            joined: u.joinDate ? new Date(u.joinDate).toISOString().slice(0, 10) : '',
        }));

        const cols = [
            ['studentId', 'Student ID'],
            ['name', 'Name'],
            ['portalEmail', 'Portal Email'],
            ['personalEmail', 'Personal Email'],
            ['role', 'Role'],
            ['phone', 'Phone'],
            ['status', 'Status'],
            ['joined', 'Joined'],
        ];

        const esc = (v) => {
            const s = String(v ?? '');
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };

        const csv = [
            cols.map((c) => esc(c[1])).join(','),
            ...rows.map((r) => cols.map((c) => esc(r[c[0]])).join(',')),
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gorythm-${variant}-records-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        showAlert(error.response?.data?.error || error.message || 'Failed to export CSV', 'error');
    }
}
