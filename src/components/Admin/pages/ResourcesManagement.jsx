import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { lmsAdminGet, lmsAdminPost, lmsAdminPatch } from '../../../utils/lmsAdminApi';
import { useAdminDialog } from '../AdminDialogContext';
import { hasLmsUploadValue, resolveLmsUploadList } from '../../../utils/fileUploadApi';
import { AUTH_REALM } from '../../../utils/authStorage';
import AdminAssignmentSubmissions from './AdminAssignmentSubmissions';
import AdminResearchTab from './AdminResearchTab';
import ResearchComments from './ResearchComments';
import { QUARANTINE_LABEL, MOVED_TO_QUARANTINE_PHRASE } from '../../../utils/adminListLabels';
import LmsMaterialPreviewModal from '../shared/LmsMaterialPreviewModal';
import { useAdminSearch } from '../../../hooks/useAdminSearch';
import { filterByKeywordSearch } from '../../../utils/adminSearch';
import { buildListCacheKey, createListCache } from '../../../utils/adminListCache';
import AssignmentsTab from './ResourcesManagement/AssignmentsTab';
import ResourcesTab from './ResourcesManagement/ResourcesTab';
import { computeTargetPairs } from './ResourcesManagement/lmsTargeting';
import { markPortalPageVisited, ADMIN_SEEN_TAB_ASSIGNMENTS, ADMIN_SEEN_TAB_RESOURCES, ADMIN_SEEN_TAB_SUBMISSIONS } from '../../../utils/portalNewItems';
import { scheduleScrollToElement } from '../../../utils/portalScroll';
import { useAdminPortalBadges } from '../../../hooks/useAdminPortalBadges';
import { toLocalDateStr } from '../../../utils/academyWeek';
import './LmsManagement.scss';

const TABS = [
  { id: 'assignments', label: 'Assignments' },
  { id: 'resources', label: 'Books & Resources' },
  { id: 'research', label: 'Research' },
  { id: 'submissions', label: 'Student Submissions' },
];

const EMPTY_ASSIGNMENT = {
  courseIds: [],
  teacherIds: [],
  courseId: '',
  teacherId: '',
  title: '',
  description: '',
  dueDate: '',
  attachments: [],
};

const EMPTY_RESOURCE = {
  courseIds: [],
  teacherIds: [],
  courseId: '',
  teacherId: '',
  title: '',
  description: '',
  fileUrl: '',
  attachments: [],
  type: 'file',
  scope: 'teacher',
};

const listAttachments = (record) => {
  if (Array.isArray(record?.attachments) && record.attachments.length) {
    return record.attachments.filter(Boolean);
  }
  return record?.fileUrl ? [record.fileUrl] : [];
};

const ResourcesManagement = ({ defaultTab = 'assignments' }) => {
  const { showAlert, showConfirm } = useAdminDialog();
  const { resourcesTabCounts } = useAdminPortalBadges();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const initialTab =
    defaultTab === 'submissions' || location.pathname.endsWith('/submissions')
      ? 'submissions'
      : defaultTab === 'research' || location.pathname.endsWith('/research')
        ? 'research'
        : defaultTab === 'resources' || location.pathname.endsWith('/resources')
          ? 'resources'
          : 'assignments';
  const [tab, setTab] = useState(initialTab);
  const [savingResource, setSavingResource] = useState(false);
  const savingResourceRef = useRef(false);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const savingAssignmentRef = useRef(false);
  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [courseTeachers, setCourseTeachers] = useState({});
  const [assignments, setAssignments] = useState([]);
  const [resources, setResources] = useState([]);
  const [assignForm, setAssignForm] = useState(EMPTY_ASSIGNMENT);
  const [resourceForm, setResourceForm] = useState(EMPTY_RESOURCE);
  const [editingAssignId, setEditingAssignId] = useState(null);
  const [editingResourceId, setEditingResourceId] = useState(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState(() => new Set());
  const [deletingResources, setDeletingResources] = useState(false);
  const [assignListCourseFilter, setAssignListCourseFilter] = useState('');
  const [resourceListCourseFilter, setResourceListCourseFilter] = useState('');
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState(() => new Set());
  const [deletingAssignments, setDeletingAssignments] = useState(false);
  const [assignListMode, setAssignListMode] = useState('active');
  const [resourceListMode, setResourceListMode] = useState('active');
  const [assignTrashCount, setAssignTrashCount] = useState(0);
  const [resourceTrashCount, setResourceTrashCount] = useState(0);
  const [assignFormExpanded, setAssignFormExpanded] = useState(true);
  const [resourceFormExpanded, setResourceFormExpanded] = useState(true);
  const [researchSubTab, setResearchSubTab] = useState('articles');
  const [materialPreview, setMaterialPreview] = useState(null);
  const assignListCacheRef = useRef(createListCache());
  const resourceListCacheRef = useRef(createListCache());
  const assignMetaLoadedRef = useRef(false);
  const resourceMetaLoadedRef = useRef(false);
  const assignFormAnchorRef = useRef(null);
  const resourceFormAnchorRef = useRef(null);
  const pendingAssignScrollRef = useRef(false);
  const pendingResourceScrollRef = useRef(false);
  const assignmentListSearch = useAdminSearch();
  const resourceListSearch = useAdminSearch();

  const filteredAssignments = useMemo(
    () =>
      filterByKeywordSearch(assignments, assignmentListSearch.debouncedSearch, (a) => [
        a.title,
        a.description,
        a.course?.title,
        a.teacher?.name,
      ]),
    [assignments, assignmentListSearch.debouncedSearch]
  );

  const filteredResources = useMemo(
    () =>
      filterByKeywordSearch(resources, resourceListSearch.debouncedSearch, (r) => [
        r.title,
        r.description,
        r.type,
        r.course?.title,
        r.fileUrl,
        ...(Array.isArray(r.attachments) ? r.attachments : []),
      ]),
    [resources, resourceListSearch.debouncedSearch]
  );

  const invalidateAssignCache = useCallback(() => {
    assignListCacheRef.current.clear();
    assignMetaLoadedRef.current = false;
  }, []);

  const invalidateResourceCache = useCallback(() => {
    resourceListCacheRef.current.clear();
    resourceMetaLoadedRef.current = false;
  }, []);

  const ensureAssignMeta = useCallback(async () => {
    if (assignMetaLoadedRef.current && courses.length) return;
    const meta = await lmsAdminGet('/assignments?metaOnly=1');
    if (meta.success) {
      setCourses(meta.courses || []);
      setTeachers(meta.teachers || []);
      if (meta.courseTeachers) setCourseTeachers(meta.courseTeachers);
      if (typeof meta.trashCount === 'number') setAssignTrashCount(meta.trashCount);
      assignMetaLoadedRef.current = true;
    }
  }, [courses.length]);

  const ensureResourceMeta = useCallback(async () => {
    if (resourceMetaLoadedRef.current && courses.length) return;
    const meta = await lmsAdminGet('/resources?metaOnly=1');
    if (meta.success) {
      if (meta.courses?.length) setCourses(meta.courses);
      if (meta.teachers?.length) setTeachers(meta.teachers);
      if (meta.courseTeachers) setCourseTeachers(meta.courseTeachers);
      if (typeof meta.trashCount === 'number') setResourceTrashCount(meta.trashCount);
      resourceMetaLoadedRef.current = true;
    }
  }, [courses.length]);

  const loadAssignments = useCallback(async ({ force = false } = {}) => {
    try {
      if (!assignListCourseFilter) {
        await ensureAssignMeta();
        setAssignments([]);
        return;
      }
      const cacheKey = buildListCacheKey({
        course: assignListCourseFilter,
        mode: assignListMode,
      });
      if (!force && assignListCacheRef.current.has(cacheKey)) {
        const cached = assignListCacheRef.current.get(cacheKey);
        setAssignments(cached.assignments || []);
        if (cached.courses?.length) setCourses(cached.courses);
        if (cached.teachers?.length) setTeachers(cached.teachers);
        if (cached.courseTeachers) setCourseTeachers(cached.courseTeachers);
        if (typeof cached.trashCount === 'number') setAssignTrashCount(cached.trashCount);
        return;
      }
      const path =
        assignListCourseFilter === 'all'
          ? '/assignments'
          : `/assignments?courseId=${encodeURIComponent(assignListCourseFilter)}`;
      const trashQ = assignListMode === 'trash' ? (path.includes('?') ? '&trash=1' : '?trash=1') : '';
      const res = await lmsAdminGet(`${path}${trashQ}`);
      if (res.success) {
        assignListCacheRef.current.set(cacheKey, res);
        assignMetaLoadedRef.current = true;
        setAssignments(res.assignments || []);
        if (res.courses?.length) setCourses(res.courses);
        if (res.teachers?.length) setTeachers(res.teachers);
        if (res.courseTeachers) setCourseTeachers(res.courseTeachers);
        if (typeof res.trashCount === 'number') setAssignTrashCount(res.trashCount);
      }
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }, [assignListCourseFilter, assignListMode, ensureAssignMeta, showAlert]);

  const loadResources = useCallback(async ({ force = false } = {}) => {
    try {
      if (!resourceListCourseFilter) {
        await ensureResourceMeta();
        setResources([]);
        return;
      }
      const cacheKey = buildListCacheKey({
        course: resourceListCourseFilter,
        mode: resourceListMode,
      });
      if (!force && resourceListCacheRef.current.has(cacheKey)) {
        const cached = resourceListCacheRef.current.get(cacheKey);
        setResources(cached.resources || []);
        if (cached.courses?.length) setCourses(cached.courses);
        if (typeof cached.trashCount === 'number') setResourceTrashCount(cached.trashCount);
        return;
      }
      const path =
        resourceListCourseFilter === 'all'
          ? '/resources'
          : `/resources?courseId=${encodeURIComponent(resourceListCourseFilter)}`;
      const trashQ = resourceListMode === 'trash' ? (path.includes('?') ? '&trash=1' : '?trash=1') : '';
      const res = await lmsAdminGet(`${path}${trashQ}`);
      if (res.success) {
        resourceListCacheRef.current.set(cacheKey, res);
        resourceMetaLoadedRef.current = true;
        setResources(res.resources || []);
        if (typeof res.trashCount === 'number') setResourceTrashCount(res.trashCount);
        if (res.courses?.length) setCourses(res.courses);
        if (res.teachers?.length) setTeachers(res.teachers);
        if (res.courseTeachers) setCourseTeachers(res.courseTeachers);
      }
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }, [resourceListCourseFilter, resourceListMode, ensureResourceMeta, showAlert]);

  useEffect(() => {
    const nextTab =
      defaultTab === 'submissions' || location.pathname.endsWith('/submissions')
        ? 'submissions'
        : defaultTab === 'research' || location.pathname.endsWith('/research')
          ? 'research'
          : defaultTab === 'resources' || location.pathname.endsWith('/resources')
            ? 'resources'
            : 'assignments';
    setTab(nextTab);
  }, [defaultTab, location.pathname]);

  useEffect(() => {
    const urlTab = searchParams.get('tab');
    const section = searchParams.get('section');
    if (urlTab === 'research') setTab('research');
    else if (urlTab === 'resources') setTab('resources');
    else if (urlTab === 'submissions') setTab('submissions');
    else if (urlTab === 'assignments') setTab('assignments');
    if (section === 'comments') setResearchSubTab('comments');
    else if (section === 'articles') setResearchSubTab('articles');
  }, [searchParams]);

  useEffect(() => {
    if (tab === 'assignments') markPortalPageVisited(ADMIN_SEEN_TAB_ASSIGNMENTS);
    else if (tab === 'resources') markPortalPageVisited(ADMIN_SEEN_TAB_RESOURCES);
    else if (tab === 'submissions') markPortalPageVisited(ADMIN_SEEN_TAB_SUBMISSIONS);
  }, [tab]);

  useEffect(() => {
    if (tab === 'assignments') loadAssignments();
    else if (tab === 'resources') loadResources();
  }, [tab, loadAssignments, loadResources]);

  useEffect(() => {
    if (!pendingAssignScrollRef.current || !assignFormExpanded || !editingAssignId) return;
    scheduleScrollToElement(() => assignFormAnchorRef.current);
    pendingAssignScrollRef.current = false;
  }, [assignFormExpanded, editingAssignId]);

  useEffect(() => {
    if (!pendingResourceScrollRef.current || !resourceFormExpanded || !editingResourceId) return;
    scheduleScrollToElement(() => resourceFormAnchorRef.current);
    pendingResourceScrollRef.current = false;
  }, [resourceFormExpanded, editingResourceId]);

  const onCourseChangeAssign = (courseId) => {
    const courseTeacherList = courseTeachers[String(courseId)] || [];
    const course = courses.find((c) => String(c._id) === String(courseId));
    const defaultTeacher = courseTeacherList[0]?._id
      ? String(courseTeacherList[0]._id)
      : course?.instructor?._id
        ? String(course.instructor._id)
        : course?.instructor
          ? String(course.instructor)
          : '';
    setAssignForm((f) => ({
      ...f,
      courseId,
      teacherId: defaultTeacher,
    }));
  };

  const resetAssignForm = () => {
    setAssignForm(EMPTY_ASSIGNMENT);
    setEditingAssignId(null);
  };

  const resetResourceForm = () => {
    setResourceForm(EMPTY_RESOURCE);
    setEditingResourceId(null);
  };

  const startEditAssignment = (a) => {
    setAssignFormExpanded(true);
    setEditingAssignId(a._id);
    const courseId = String(a.course?._id || a.course || '');
    const teacherId = String(a.teacher?._id || a.teacher || '');
    setAssignForm({
      courseIds: [],
      teacherIds: [],
      courseId,
      teacherId,
      title: a.title || '',
      description: a.description || '',
      dueDate: a.dueDate ? toLocalDateStr(new Date(a.dueDate)) : '',
      attachments: listAttachments(a),
    });
    requestAnimationFrame(() => {
      pendingAssignScrollRef.current = true;
    });
  };

  const startEditResource = (r) => {
    setResourceFormExpanded(true);
    setEditingResourceId(r._id);
    const type = r.type || 'file';
    const courseId = String(r.course?._id || r.course || '');
    const teacherId = String(r.teacher?._id || r.teacher || '');
    setResourceForm({
      courseIds: [],
      teacherIds: [],
      courseId,
      teacherId,
      title: r.title || '',
      description: r.description || '',
      fileUrl: type === 'link' ? r.fileUrl || '' : '',
      attachments: type === 'file' ? listAttachments(r) : [],
      type,
      scope: r.scope === 'course' ? 'course' : 'teacher',
    });
    requestAnimationFrame(() => {
      pendingResourceScrollRef.current = true;
    });
  };

  const saveAssignment = async (e) => {
    e.preventDefault();
    if (savingAssignmentRef.current) return;
    savingAssignmentRef.current = true;
    setSavingAssignment(true);
    try {
      if (!editingAssignId) {
        const pairCount = computeTargetPairs(
          assignForm.courseIds,
          assignForm.teacherIds,
          courseTeachers
        ).length;
        if (!pairCount) {
          showAlert('Select at least one valid course + teacher pair.', 'error');
          return;
        }
      }
      const attachments = await resolveLmsUploadList(
        assignForm.attachments,
        'assignments',
        AUTH_REALM.ADMIN
      );
      if (editingAssignId) {
        const payload = {
          courseId: assignForm.courseId,
          teacherId: assignForm.teacherId,
          title: assignForm.title,
          description: assignForm.description,
          dueDate: assignForm.dueDate,
          attachments,
        };
        await lmsAdminPatch(`/assignments/${editingAssignId}`, payload);
        showAlert('Assignment updated.', 'success');
      } else {
        const res = await lmsAdminPost('/assignments', {
          courseIds: assignForm.courseIds,
          teacherIds: assignForm.teacherIds,
          title: assignForm.title,
          description: assignForm.description,
          dueDate: assignForm.dueDate,
          attachments,
        });
        const n = res.createdCount ?? res.assignments?.length ?? 1;
        showAlert(
          `${n} assignment${n === 1 ? '' : 's'} published. Visible to matching teacher slots and their students.`,
          'success'
        );
      }
      resetAssignForm();
      invalidateAssignCache();
      await loadAssignments({ force: true });
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      savingAssignmentRef.current = false;
      setSavingAssignment(false);
    }
  };

  const saveResource = async (e) => {
    e.preventDefault();
    if (savingResourceRef.current) return;
    savingResourceRef.current = true;
    setSavingResource(true);
    try {
      if (
        resourceForm.type === 'file' &&
        !hasLmsUploadValue(resourceForm.attachments) &&
        !resourceForm.fileUrl?.trim() &&
        !editingResourceId
      ) {
        showAlert('Choose at least one file or paste an external URL.', 'error');
        return;
      }
      let attachments = [];
      let fileUrl = '';
      if (resourceForm.type === 'file') {
        attachments = await resolveLmsUploadList(
          resourceForm.attachments,
          'content/books',
          AUTH_REALM.ADMIN
        );
        const external = resourceForm.fileUrl?.trim();
        if (external && !attachments.includes(external)) attachments.push(external);
        fileUrl = attachments[0] || '';
      } else if (resourceForm.type === 'link') {
        fileUrl = resourceForm.fileUrl?.trim() || '';
      }
      const payload = editingResourceId
        ? {
            courseId: resourceForm.courseId,
            teacherId: resourceForm.teacherId || undefined,
            title: resourceForm.title,
            description: resourceForm.description,
            type: resourceForm.type,
            fileUrl,
            attachments,
            scope: resourceForm.scope,
          }
        : {
            courseIds:
              resourceForm.scope === 'course'
                ? resourceForm.courseIds
                : resourceForm.courseIds,
            teacherIds: resourceForm.scope === 'course' ? [] : resourceForm.teacherIds,
            title: resourceForm.title,
            description: resourceForm.description,
            type: resourceForm.type,
            fileUrl,
            attachments,
            scope: resourceForm.scope,
          };
      if (!editingResourceId) {
        const count =
          resourceForm.scope === 'course'
            ? resourceForm.courseIds.length
            : computeTargetPairs(resourceForm.courseIds, resourceForm.teacherIds, courseTeachers).length;
        if (!count) {
          showAlert(
            resourceForm.scope === 'course'
              ? 'Select at least one course.'
              : 'Select at least one valid course + teacher pair.',
            'error'
          );
          return;
        }
      }
      if (editingResourceId) {
        await lmsAdminPatch(`/resources/${editingResourceId}`, payload);
        showAlert('Resource updated.', 'success');
      } else {
        const res = await lmsAdminPost('/resources', payload);
        const n = res.createdCount ?? res.resources?.length ?? 1;
        showAlert(`${n} resource${n === 1 ? '' : 's'} added.`, 'success');
      }
      resetResourceForm();
      invalidateResourceCache();
      await loadResources({ force: true });
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      savingResourceRef.current = false;
      setSavingResource(false);
    }
  };

  const trashAssignmentsByIds = async (ids, confirmText) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm(
      confirmText ||
        `Move ${idList.length} assignment${idList.length > 1 ? 's' : ''} to ${QUARANTINE_LABEL}? Student submissions are moved to ${QUARANTINE_LABEL} too.`
    );
    if (!ok) return;
    setDeletingAssignments(true);
    try {
      const res = await lmsAdminPost('/assignments/bulk-delete', { ids: idList });
      const moved = res.deletedCount ?? idList.length;
      showAlert(`${moved} assignment${moved !== 1 ? 's' : ''} ${MOVED_TO_QUARANTINE_PHRASE}.`, 'success');
      setSelectedAssignmentIds(new Set());
      if (editingAssignId && idList.includes(String(editingAssignId))) resetAssignForm();
      invalidateAssignCache();
      await loadAssignments({ force: true });
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingAssignments(false);
    }
  };

  const restoreAssignmentsByIds = async (ids) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm(`Restore ${idList.length} assignment${idList.length > 1 ? 's' : ''}?`);
    if (!ok) return;
    setDeletingAssignments(true);
    try {
      const res = await lmsAdminPost('/assignments/bulk-restore', { ids: idList });
      const restored = res.restoredCount ?? idList.length;
      showAlert(`${restored} assignment${restored !== 1 ? 's' : ''} restored.`, 'success');
      setSelectedAssignmentIds(new Set());
      invalidateAssignCache();
      await loadAssignments({ force: true });
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingAssignments(false);
    }
  };

  const permanentDeleteAssignmentsByIds = async (ids, confirmText) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm(
      confirmText ||
        `Permanently delete ${idList.length} assignment${idList.length > 1 ? 's' : ''}? This cannot be undone.`
    );
    if (!ok) return;
    setDeletingAssignments(true);
    try {
      const res = await lmsAdminPost('/assignments/bulk-permanent-delete', { ids: idList });
      const removed = res.deletedCount ?? idList.length;
      showAlert(`${removed} assignment${removed !== 1 ? 's' : ''} deleted forever.`, 'success');
      setSelectedAssignmentIds(new Set());
      invalidateAssignCache();
      await loadAssignments({ force: true });
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingAssignments(false);
    }
  };

  const removeAssignment = async (id) => {
    if (assignListMode === 'trash') {
      permanentDeleteAssignmentsByIds([String(id)], 'Permanently delete this assignment?');
      return;
    }
    trashAssignmentsByIds([String(id)], `Move this assignment to ${QUARANTINE_LABEL}?`);
  };

  const bulkAssignmentAction = () => {
    if (assignListMode === 'trash') {
      if (selectedAssignmentIds.size) permanentDeleteAssignmentsByIds(selectedAssignmentIds);
      return;
    }
    trashAssignmentsByIds(selectedAssignmentIds);
  };

  const bulkRestoreAssignments = () => restoreAssignmentsByIds(selectedAssignmentIds);

  const toggleAssignmentSelect = (id) => {
    if (!id) return;
    setSelectedAssignmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleResourceSelect = (id) => {
    if (!id) return;
    setSelectedResourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const trashResourcesByIds = async (ids, confirmText) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm(
      confirmText || `Move ${idList.length} resource${idList.length > 1 ? 's' : ''} to ${QUARANTINE_LABEL}?`
    );
    if (!ok) return;
    setDeletingResources(true);
    try {
      const res = await lmsAdminPost('/resources/bulk-delete', { ids: idList });
      const moved = res.deletedCount ?? idList.length;
      showAlert(`${moved} resource${moved !== 1 ? 's' : ''} ${MOVED_TO_QUARANTINE_PHRASE}.`, 'success');
      setSelectedResourceIds(new Set());
      if (editingResourceId && idList.includes(String(editingResourceId))) resetResourceForm();
      invalidateResourceCache();
      await loadResources({ force: true });
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingResources(false);
    }
  };

  const restoreResourcesByIds = async (ids) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm(`Restore ${idList.length} resource${idList.length > 1 ? 's' : ''}?`);
    if (!ok) return;
    setDeletingResources(true);
    try {
      const res = await lmsAdminPost('/resources/bulk-restore', { ids: idList });
      const restored = res.restoredCount ?? idList.length;
      showAlert(`${restored} resource${restored !== 1 ? 's' : ''} restored.`, 'success');
      setSelectedResourceIds(new Set());
      invalidateResourceCache();
      await loadResources({ force: true });
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingResources(false);
    }
  };

  const permanentDeleteResourcesByIds = async (ids, confirmText) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm(
      confirmText || `Permanently delete ${idList.length} resource${idList.length > 1 ? 's' : ''}?`
    );
    if (!ok) return;
    setDeletingResources(true);
    try {
      const res = await lmsAdminPost('/resources/bulk-permanent-delete', { ids: idList });
      const removed = res.deletedCount ?? idList.length;
      showAlert(`${removed} resource${removed !== 1 ? 's' : ''} deleted forever.`, 'success');
      setSelectedResourceIds(new Set());
      invalidateResourceCache();
      await loadResources({ force: true });
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingResources(false);
    }
  };

  const removeResource = async (id) => {
    if (resourceListMode === 'trash') {
      permanentDeleteResourcesByIds([String(id)], 'Permanently delete this resource?');
      return;
    }
    trashResourcesByIds([String(id)], `Move this resource to ${QUARANTINE_LABEL}?`);
  };

  const bulkResourceAction = () => {
    if (resourceListMode === 'trash') {
      if (selectedResourceIds.size) permanentDeleteResourcesByIds(selectedResourceIds);
      return;
    }
    trashResourcesByIds(selectedResourceIds);
  };

  const bulkRestoreResources = () => restoreResourcesByIds(selectedResourceIds);

  const restoreAssignment = async (id) => {
    restoreAssignmentsByIds([String(id)]);
  };

  const restoreResource = async (id) => {
    restoreResourcesByIds([String(id)]);
  };

  return (
    <div className="lms-management resources-management">
      <h1>Resources & Submissions</h1>
      <p className="lms-management-lead">
        Manage assignments, course materials, research articles, and review student assignment and quiz submissions by course.
      </p>
      <div className="lms-management-tabs">
        {TABS.map((t) => {
          const tabBadge =
            t.id === 'assignments'
              ? resourcesTabCounts?.assignments
              : t.id === 'resources'
                ? resourcesTabCounts?.resources
                : t.id === 'submissions'
                  ? resourcesTabCounts?.submissions
                  : 0;
          return (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {tabBadge > 0 ? (
              <span className="lms-tab-badge" aria-label={`${tabBadge} new`}>
                {tabBadge > 99 ? '99+' : tabBadge}
              </span>
            ) : null}
          </button>
          );
        })}
      </div>
      {tab === 'assignments' ? (
        <AssignmentsTab
          assignFormAnchorRef={assignFormAnchorRef}
          editingAssignId={editingAssignId}
          assignFormExpanded={assignFormExpanded}
          setAssignFormExpanded={setAssignFormExpanded}
          saveAssignment={saveAssignment}
          assignForm={assignForm}
          setAssignForm={setAssignForm}
          onCourseChangeAssign={onCourseChangeAssign}
          courses={courses}
          teachers={teachers}
          courseTeachers={courseTeachers}
          savingAssignment={savingAssignment}
          resetAssignForm={resetAssignForm}
          assignmentListSearch={assignmentListSearch}
          assignListCourseFilter={assignListCourseFilter}
          setAssignListCourseFilter={setAssignListCourseFilter}
          setSelectedAssignmentIds={setSelectedAssignmentIds}
          assignListMode={assignListMode}
          setAssignListMode={setAssignListMode}
          assignTrashCount={assignTrashCount}
          selectedAssignmentIds={selectedAssignmentIds}
          bulkAssignmentAction={bulkAssignmentAction}
          deletingAssignments={deletingAssignments}
          bulkRestoreAssignments={bulkRestoreAssignments}
          filteredAssignments={filteredAssignments}
          assignments={assignments}
          toggleAssignmentSelect={toggleAssignmentSelect}
          restoreAssignment={restoreAssignment}
          setMaterialPreview={setMaterialPreview}
          startEditAssignment={startEditAssignment}
          removeAssignment={removeAssignment}
        />
      ) : tab === 'research' ? (
        <div className="lms-research-section">
          <div className="lms-research-subtabs">
            <button type="button" className={researchSubTab === 'articles' ? 'active' : ''} onClick={() => setResearchSubTab('articles')}>Articles</button>
            <button type="button" className={researchSubTab === 'comments' ? 'active' : ''} onClick={() => setResearchSubTab('comments')}>Queries & Feedback</button>
          </div>
          {researchSubTab === 'comments' ? <ResearchComments embedded /> : <AdminResearchTab />}
        </div>
      ) : tab === 'resources' ? (
        <ResourcesTab
          resourceFormAnchorRef={resourceFormAnchorRef}
          editingResourceId={editingResourceId}
          resourceFormExpanded={resourceFormExpanded}
          setResourceFormExpanded={setResourceFormExpanded}
          saveResource={saveResource}
          resourceForm={resourceForm}
          setResourceForm={setResourceForm}
          courses={courses}
          teachers={teachers}
          courseTeachers={courseTeachers}
          savingResource={savingResource}
          resetResourceForm={resetResourceForm}
          resourceListSearch={resourceListSearch}
          resourceListCourseFilter={resourceListCourseFilter}
          setResourceListCourseFilter={setResourceListCourseFilter}
          setSelectedResourceIds={setSelectedResourceIds}
          resourceListMode={resourceListMode}
          setResourceListMode={setResourceListMode}
          resourceTrashCount={resourceTrashCount}
          filteredResources={filteredResources}
          resources={resources}
          selectedResourceIds={selectedResourceIds}
          bulkResourceAction={bulkResourceAction}
          deletingResources={deletingResources}
          bulkRestoreResources={bulkRestoreResources}
          toggleResourceSelect={toggleResourceSelect}
          restoreResource={restoreResource}
          setMaterialPreview={setMaterialPreview}
          startEditResource={startEditResource}
          removeResource={removeResource}
        />
      ) : (
        <div className="lms-panel"><AdminAssignmentSubmissions /></div>
      )}
      <LmsMaterialPreviewModal
        open={Boolean(materialPreview)}
        kind={materialPreview?.kind}
        item={materialPreview?.item}
        onClose={() => setMaterialPreview(null)}
      />
    </div>
  );
};

export default ResourcesManagement;
