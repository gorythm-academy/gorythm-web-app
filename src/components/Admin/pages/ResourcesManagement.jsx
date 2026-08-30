import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RequiredMark from '../../shared/RequiredMark';
import { useLocation, useSearchParams } from 'react-router-dom';
import { lmsAdminGet, lmsAdminPost, lmsAdminPatch } from '../../../utils/lmsAdminApi';
import { useAdminDialog } from '../AdminDialogContext';
import { hasLmsUploadValue, resolveLmsUploadList } from '../../../utils/fileUploadApi';
import FileUploadField from '../../Portals/shared/FileUploadField';
import { AUTH_REALM } from '../../../utils/authStorage';
import AdminAssignmentSubmissions from './AdminAssignmentSubmissions';
import AdminResearchTab from './AdminResearchTab';
import ResearchComments from './ResearchComments';
import LmsTrashTabs from '../shared/LmsTrashTabs';
import { QUARANTINE_LABEL, MOVED_TO_QUARANTINE_PHRASE, MOVE_TO_QUARANTINE_PHRASE } from '../../../utils/adminListLabels';
import LmsCollapsibleFormPanel from '../shared/LmsCollapsibleFormPanel';
import LmsMaterialPreviewModal from '../shared/LmsMaterialPreviewModal';
import AdminSearchBox from '../shared/AdminSearchBox';
import { useAdminSearch } from '../../../hooks/useAdminSearch';
import { filterByKeywordSearch } from '../../../utils/adminSearch';
import { buildListCacheKey, createListCache } from '../../../utils/adminListCache';
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

const minDueDateValue = () => toLocalDateStr(new Date());

function computeTargetPairs(courseIds, teacherIds, courseTeachers) {
  const pairs = [];
  const courses = (courseIds || []).map(String);
  const teachers = (teacherIds || []).map(String);
  for (const courseId of courses) {
    const allowed = new Set((courseTeachers?.[courseId] || []).map((t) => String(t._id)));
    for (const teacherId of teachers) {
      if (allowed.has(teacherId)) pairs.push({ courseId, teacherId });
    }
  }
  return pairs;
}

function LmsTargetSelect({
  courses,
  teachers,
  courseTeachers,
  selectedCourseIds,
  selectedTeacherIds,
  onCoursesChange,
  onTeachersChange,
  previewNoun,
  requireTeachers = true,
}) {
  const allCourseIds = courses.map((c) => String(c._id));
  const allTeacherIds = teachers.map((t) => String(t._id));
  const allCoursesSelected =
    allCourseIds.length > 0 && allCourseIds.every((id) => selectedCourseIds.includes(id));
  const allTeachersSelected =
    allTeacherIds.length > 0 && allTeacherIds.every((id) => selectedTeacherIds.includes(id));
  const pairCount = requireTeachers
    ? computeTargetPairs(selectedCourseIds, selectedTeacherIds, courseTeachers).length
    : selectedCourseIds.length;

  return (
    <div className="lms-target-select">
      <div className="lms-target-select__group">
        <div className="lms-target-select__head">
          <span>Courses *</span>
          <label className="lms-checkbox-field lms-target-select__select-all">
            <input
              type="checkbox"
              checked={allCoursesSelected}
              onChange={() => onCoursesChange(allCoursesSelected ? [] : allCourseIds)}
            />
            <span>Select all</span>
          </label>
        </div>
        <div className="lms-target-select__grid">
          {courses.map((c) => {
            const id = String(c._id);
            return (
              <label key={id} className="lms-checkbox-field lms-target-select__item">
                <input
                  type="checkbox"
                  checked={selectedCourseIds.includes(id)}
                  onChange={() =>
                    onCoursesChange(
                      selectedCourseIds.includes(id)
                        ? selectedCourseIds.filter((x) => x !== id)
                        : [...selectedCourseIds, id]
                    )
                  }
                />
                <span>{c.title}</span>
              </label>
            );
          })}
        </div>
      </div>
      {requireTeachers ? (
        <div className="lms-target-select__group">
          <div className="lms-target-select__head">
            <span>Teachers *</span>
            <label className="lms-checkbox-field lms-target-select__select-all">
              <input
                type="checkbox"
                checked={allTeachersSelected}
                onChange={() => onTeachersChange(allTeachersSelected ? [] : allTeacherIds)}
              />
              <span>Select all</span>
            </label>
          </div>
          <div className="lms-target-select__grid">
            {teachers.map((t) => {
              const id = String(t._id);
              return (
                <label key={id} className="lms-checkbox-field lms-target-select__item">
                  <input
                    type="checkbox"
                    checked={selectedTeacherIds.includes(id)}
                    onChange={() =>
                      onTeachersChange(
                        selectedTeacherIds.includes(id)
                          ? selectedTeacherIds.filter((x) => x !== id)
                          : [...selectedTeacherIds, id]
                      )
                    }
                  />
                  <span>{t.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
      <p className="lms-target-select__preview">
        {pairCount > 0 ? (
          <>
            <i className="fas fa-check-circle" aria-hidden="true" /> {pairCount} {previewNoun}
            {pairCount === 1 ? '' : 's'} will be published (valid course + teacher pairs only)
          </>
        ) : (
          <>
            <i className="fas fa-info-circle" aria-hidden="true" /> Select courses
            {requireTeachers ? ' and teachers' : ''} — only matching pairs are published
          </>
        )}
      </p>
    </div>
  );
}

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
        <div className="lms-panel">
          <div ref={assignFormAnchorRef}>
          <LmsCollapsibleFormPanel
            title={editingAssignId ? 'Edit Assignment' : 'Add Assignment'}
            subtitle={editingAssignId ? 'Update assignment details' : 'Publish homework for teachers and students'}
            icon="fa-tasks"
            tone="indigo"
            expanded={assignFormExpanded}
            onToggle={() => setAssignFormExpanded((v) => !v)}
          >
          <form className="lms-form-grid portal-form-card" onSubmit={saveAssignment} autoComplete="off">
            {editingAssignId ? (
              <>
                <label className="lms-field-label">
                  <span>Course <RequiredMark /></span>
                  <select
                    value={assignForm.courseId}
                    onChange={(e) => onCourseChangeAssign(e.target.value)}
                    required
                  >
                    <option value="">Select course</option>
                    {courses.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="lms-field-label">
                  <span>Teacher <RequiredMark /></span>
                  <select
                    value={assignForm.teacherId}
                    onChange={(e) => setAssignForm({ ...assignForm, teacherId: e.target.value })}
                    required
                  >
                    <option value="">Select teacher</option>
                    {(courseTeachers[String(assignForm.courseId)] || teachers).map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <LmsTargetSelect
                courses={courses}
                teachers={teachers}
                courseTeachers={courseTeachers}
                selectedCourseIds={assignForm.courseIds}
                selectedTeacherIds={assignForm.teacherIds}
                onCoursesChange={(courseIds) => setAssignForm({ ...assignForm, courseIds })}
                onTeachersChange={(teacherIds) => setAssignForm({ ...assignForm, teacherIds })}
                previewNoun="assignment"
              />
            )}
            <label className="lms-field-label">
              <span>Title <RequiredMark /></span>
              <input
                value={assignForm.title}
                onChange={(e) => setAssignForm({ ...assignForm, title: e.target.value })}
                placeholder="Title shown to teachers and students"
                required
                autoComplete="off"
              />
            </label>
            <label className="lms-field-label">
              <span>Due date <RequiredMark /></span>
              <input
                type="date"
                value={assignForm.dueDate}
                min={minDueDateValue()}
                onChange={(e) => setAssignForm({ ...assignForm, dueDate: e.target.value })}
                required
              />
            </label>
            <label className="lms-field-label">
              <span>Description</span>
              <textarea
                value={assignForm.description}
                onChange={(e) => setAssignForm({ ...assignForm, description: e.target.value })}
                placeholder="Instructions or details for this assignment"
              />
            </label>
            <FileUploadField
              label="Attachments (PDF / files)"
              value={assignForm.attachments}
              onChange={(attachments) => setAssignForm({ ...assignForm, attachments })}
              multiple
            />
            <div className="lms-form-actions">
              <button type="submit" disabled={savingAssignment}>
                {savingAssignment
                  ? editingAssignId
                    ? 'Saving…'
                    : 'Publishing…'
                  : editingAssignId
                    ? 'Save changes'
                    : 'Publish assignment'}
              </button>
              {editingAssignId ? (
                <button type="button" className="lms-btn-secondary" onClick={resetAssignForm}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
          </LmsCollapsibleFormPanel>
          </div>
          <div className="lms-list-toolbar">
            <h3>Assignments List</h3>
          </div>
          <div className="controls-bar lms-list-toolbar-controls">
            <AdminSearchBox
              placeholder="Search title, course, teacher…"
              value={assignmentListSearch.searchTerm}
              onChange={(e) => assignmentListSearch.setSearchTerm(e.target.value)}
              onEnter={() => assignmentListSearch.flushSearch()}
              disabled={!assignListCourseFilter}
            />
            <div className="filter-controls">
              <label className="lms-field-label lms-list-toolbar__filter">
                <span>View by Course</span>
                <select
                  value={assignListCourseFilter}
                  onChange={(e) => {
                    setAssignListCourseFilter(e.target.value);
                    setSelectedAssignmentIds(new Set());
                  }}
                >
                  <option value="">Select course</option>
                  <option value="all">All courses</option>
                  {courses.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {assignListCourseFilter ? (
            <LmsTrashTabs
              mode={assignListMode}
              trashCount={assignTrashCount}
              onChange={(mode) => {
                setAssignListMode(mode);
                setSelectedAssignmentIds(new Set());
              }}
            />
          ) : null}

          {!assignListCourseFilter ? (
            <p className="lms-empty">Select a course or choose &quot;All courses&quot; to view assignments.</p>
          ) : (
            <>
              {selectedAssignmentIds.size > 0 ? (
                <div className="lms-resources-bulk-bar">
                  <span>{selectedAssignmentIds.size} selected</span>
                  <div className="lms-form-actions">
                    <button type="button" className="lms-btn-secondary" onClick={() => setSelectedAssignmentIds(new Set())}>
                      Clear
                    </button>
                    <button
                      type="button"
                      className={assignListMode === 'trash' ? 'lms-btn-delete-forever' : 'lms-btn-trash'}
                      onClick={bulkAssignmentAction}
                      disabled={deletingAssignments}
                    >
                      <i className={`fas ${assignListMode === 'trash' ? 'fa-trash-alt' : 'fa-archive'}`} aria-hidden />
                      {deletingAssignments
                        ? 'Working…'
                        : assignListMode === 'trash'
                          ? `Delete forever (${selectedAssignmentIds.size})`
                          : `${MOVE_TO_QUARANTINE_PHRASE} (${selectedAssignmentIds.size})`}
                    </button>
                    {assignListMode === 'trash' ? (
                      <button
                        type="button"
                        className="lms-btn-restore"
                        onClick={bulkRestoreAssignments}
                        disabled={deletingAssignments}
                      >
                        <i className="fas fa-undo" aria-hidden />
                        Restore selected
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="lms-table-wrap">
                <table className="lms-table lms-table--resources">
                  <thead>
                    <tr>
                      <th className="lms-table-check-col">
                        <input
                          type="checkbox"
                          checked={
                            filteredAssignments.length > 0 &&
                            filteredAssignments.every((a) => selectedAssignmentIds.has(String(a._id)))
                          }
                          onChange={() => {
                            if (
                              filteredAssignments.length > 0 &&
                              filteredAssignments.every((a) => selectedAssignmentIds.has(String(a._id)))
                            ) {
                              setSelectedAssignmentIds(new Set());
                            } else {
                              setSelectedAssignmentIds(
                                new Set(filteredAssignments.map((a) => String(a._id)))
                              );
                            }
                          }}
                          aria-label="Select all assignments"
                        />
                      </th>
                      <th>Title</th>
                      <th>Course</th>
                      <th>Teacher</th>
                      <th>Due</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssignments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="lms-empty-cell">
                          {assignments.length === 0
                            ? 'No assignments for this selection.'
                            : 'No assignments match your search.'}
                        </td>
                      </tr>
                    ) : (
                    filteredAssignments.map((a) => {
                      const aid = String(a._id);
                      const selected = selectedAssignmentIds.has(aid);
                      return (
                        <tr key={a._id} className={selected ? 'lms-table-row--selected' : ''}>
                          <td className="lms-table-check-col">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleAssignmentSelect(aid)}
                              aria-label={`Select ${a.title}`}
                            />
                          </td>
                          <td>
                            {a.title}
                            {a.lockedForTeacher || a.createdByRole === 'admin' ? (
                              <span className="lms-target-badge" title="Admin-published; teacher can view and extend due date only">
                                Admin
                              </span>
                            ) : null}
                          </td>
                          <td>{a.course?.title}</td>
                          <td>{a.teacher?.name || '—'}</td>
                          <td>
                            {a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '—'}
                            {a.dueDateNotice ? (
                              <div className="lms-due-date-notice">{a.dueDateNotice}</div>
                            ) : null}
                          </td>
                          <td className="lms-table-actions">
                            {assignListMode === 'trash' ? (
                              <>
                                <button
                                  type="button"
                                  className="lms-btn-restore"
                                  onClick={() => restoreAssignment(a._id)}
                                  disabled={deletingAssignments}
                                >
                                  <i className="fas fa-undo" aria-hidden /> Restore
                                </button>
                                <button
                                  type="button"
                                  className="lms-btn-delete-forever"
                                  onClick={() => removeAssignment(a._id)}
                                  disabled={deletingAssignments}
                                >
                                  <i className="fas fa-trash-alt" aria-hidden /> Delete forever
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="lms-btn-secondary"
                                  onClick={() => setMaterialPreview({ kind: 'assignment', item: a })}
                                >
                                  <i className="fas fa-eye" aria-hidden /> Preview
                                </button>
                                <button type="button" className="lms-btn-secondary" onClick={() => startEditAssignment(a)}>
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="lms-btn-trash"
                                  onClick={() => removeAssignment(a._id)}
                                  disabled={deletingAssignments}
                                >
                                  <i className="fas fa-archive" aria-hidden /> {QUARANTINE_LABEL}
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : tab === 'research' ? (
        <div className="lms-research-section">
          <div className="lms-research-subtabs">
            <button
              type="button"
              className={researchSubTab === 'articles' ? 'active' : ''}
              onClick={() => setResearchSubTab('articles')}
            >
              Articles
            </button>
            <button
              type="button"
              className={researchSubTab === 'comments' ? 'active' : ''}
              onClick={() => setResearchSubTab('comments')}
            >
              Queries & Feedback
            </button>
          </div>
          {researchSubTab === 'comments' ? (
            <ResearchComments embedded />
          ) : (
            <AdminResearchTab />
          )}
        </div>
      ) : tab === 'resources' ? (
        <div className="lms-panel">
          <div ref={resourceFormAnchorRef}>
          <LmsCollapsibleFormPanel
            title={editingResourceId ? 'Edit Resource' : 'Add Book / Resource'}
            subtitle={editingResourceId ? 'Update course material' : 'Upload PDFs, links, or notes for a course'}
            icon="fa-book"
            tone="emerald"
            expanded={resourceFormExpanded}
            onToggle={() => setResourceFormExpanded((v) => !v)}
          >
          <form className="lms-form-grid portal-form-card" onSubmit={saveResource} autoComplete="off">
            <label className="lms-field-label">
              <span>Visibility</span>
              <select
                value={resourceForm.scope}
                onChange={(e) =>
                  setResourceForm({
                    ...resourceForm,
                    scope: e.target.value,
                    teacherIds: [],
                    teacherId: '',
                  })
                }
              >
                <option value="teacher">Teacher slot (students with that teacher only)</option>
                <option value="course">Whole course (all enrolled students)</option>
              </select>
            </label>
            {editingResourceId ? (
              <>
                <label className="lms-field-label">
                  <span>Course <RequiredMark /></span>
                  <select
                    value={resourceForm.courseId}
                    onChange={(e) => setResourceForm({ ...resourceForm, courseId: e.target.value })}
                    required
                  >
                    <option value="">Select course</option>
                    {courses.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
                {resourceForm.scope === 'teacher' ? (
                  <label className="lms-field-label">
                    <span>Teacher <RequiredMark /></span>
                    <select
                      value={resourceForm.teacherId}
                      onChange={(e) => setResourceForm({ ...resourceForm, teacherId: e.target.value })}
                      required
                    >
                      <option value="">Select teacher</option>
                      {(courseTeachers[String(resourceForm.courseId)] || teachers).map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </>
            ) : (
              <LmsTargetSelect
                courses={courses}
                teachers={teachers}
                courseTeachers={courseTeachers}
                selectedCourseIds={resourceForm.courseIds}
                selectedTeacherIds={resourceForm.teacherIds}
                onCoursesChange={(courseIds) => setResourceForm({ ...resourceForm, courseIds })}
                onTeachersChange={(teacherIds) => setResourceForm({ ...resourceForm, teacherIds })}
                previewNoun="resource"
                requireTeachers={resourceForm.scope === 'teacher'}
              />
            )}
            <label className="lms-field-label">
              <span>Title <RequiredMark /></span>
              <input
                value={resourceForm.title}
                onChange={(e) => setResourceForm({ ...resourceForm, title: e.target.value })}
                placeholder="Name of the book, PDF, or resource"
                required
                autoComplete="off"
              />
            </label>
            <label className="lms-field-label">
              <span>Type</span>
              <select
                value={resourceForm.type}
                onChange={(e) => {
                  const type = e.target.value;
                  setResourceForm({
                    ...resourceForm,
                    type,
                    attachments: type === 'file' ? resourceForm.attachments : [],
                    fileUrl: type === 'link' ? resourceForm.fileUrl : '',
                  });
                }}
              >
                <option value="file">File / PDF</option>
                <option value="link">Link</option>
                <option value="note">Note</option>
              </select>
            </label>
            {resourceForm.type === 'file' ? (
              <>
                {!editingResourceId ? (
                  <p className="lms-field-hint" style={{ gridColumn: '1 / -1' }}>
                    Provide at least one uploaded file or external URL <RequiredMark />
                  </p>
                ) : null}
                <FileUploadField
                  label="Upload files or paste URL below"
                  value={resourceForm.attachments}
                  onChange={(attachments) => setResourceForm({ ...resourceForm, attachments })}
                  multiple
                />
                <label className="lms-field-label">
                  <span>Or external URL</span>
                  <input
                    placeholder="Paste a link to a PDF or external resource"
                    value={resourceForm.fileUrl}
                    onChange={(e) => setResourceForm({ ...resourceForm, fileUrl: e.target.value })}
                    autoComplete="off"
                  />
                </label>
              </>
            ) : null}
            {resourceForm.type === 'link' ? (
              <label className="lms-field-label">
                <span>Link URL{!editingResourceId ? <RequiredMark /> : null}</span>
                <input
                  placeholder="https://…"
                  value={resourceForm.fileUrl}
                  onChange={(e) => setResourceForm({ ...resourceForm, fileUrl: e.target.value })}
                  required={!editingResourceId}
                  autoComplete="off"
                />
              </label>
            ) : null}
            <label className="lms-field-label">
              <span>Description</span>
              <textarea
                value={resourceForm.description}
                onChange={(e) => setResourceForm({ ...resourceForm, description: e.target.value })}
              />
            </label>
            <div className="lms-form-actions">
              <button type="submit" disabled={savingResource}>
                {savingResource ? 'Saving…' : editingResourceId ? 'Save changes' : 'Add resource'}
              </button>
              {editingResourceId ? (
                <button type="button" className="lms-btn-secondary" onClick={resetResourceForm}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
          </LmsCollapsibleFormPanel>
          </div>
          <div className="lms-resources-library">
            <div className="lms-list-toolbar">
              <h3>Course Resources</h3>
            </div>
            <div className="controls-bar lms-list-toolbar-controls">
              <AdminSearchBox
                placeholder="Search title, course, type, link…"
                value={resourceListSearch.searchTerm}
                onChange={(e) => resourceListSearch.setSearchTerm(e.target.value)}
                onEnter={() => resourceListSearch.flushSearch()}
                disabled={!resourceListCourseFilter}
              />
              <div className="filter-controls">
                <label className="lms-field-label lms-list-toolbar__filter">
                  <span>View by Course</span>
                  <select
                    value={resourceListCourseFilter}
                    onChange={(e) => {
                      setResourceListCourseFilter(e.target.value);
                      setSelectedResourceIds(new Set());
                    }}
                  >
                    <option value="">Select course</option>
                    <option value="all">All courses</option>
                    {courses.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {resourceListCourseFilter ? (
              <LmsTrashTabs
                mode={resourceListMode}
                trashCount={resourceTrashCount}
                onChange={(mode) => {
                  setResourceListMode(mode);
                  setSelectedResourceIds(new Set());
                }}
              />
            ) : null}

            {!resourceListCourseFilter ? (
              <p className="lms-empty">Select a course or choose &quot;All courses&quot; to view resources.</p>
            ) : null}

            {resourceListCourseFilter ? (
            <div className="lms-table-wrap">
              <p className="lms-resources-library__count" style={{ padding: '0.5rem 0 0.75rem', margin: 0 }}>
                {filteredResources.length} shown
                {resourceListSearch.debouncedSearch && resources.length !== filteredResources.length
                  ? ` (of ${resources.length})`
                  : ''}
              </p>
              {selectedResourceIds.size > 0 ? (
              <div className="lms-resources-bulk-bar">
                <span>{selectedResourceIds.size} selected</span>
                <div className="lms-form-actions">
                  <button
                    type="button"
                    className="lms-btn-secondary"
                    onClick={() => setSelectedResourceIds(new Set())}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className={resourceListMode === 'trash' ? 'lms-btn-delete-forever' : 'lms-btn-trash'}
                    onClick={bulkResourceAction}
                    disabled={deletingResources}
                  >
                    <i className={`fas ${resourceListMode === 'trash' ? 'fa-trash-alt' : 'fa-archive'}`} aria-hidden />
                    {deletingResources
                      ? 'Working…'
                      : resourceListMode === 'trash'
                        ? `Delete forever (${selectedResourceIds.size})`
                        : `${MOVE_TO_QUARANTINE_PHRASE} (${selectedResourceIds.size})`}
                  </button>
                  {resourceListMode === 'trash' ? (
                    <button
                      type="button"
                      className="lms-btn-restore"
                      onClick={bulkRestoreResources}
                      disabled={deletingResources}
                    >
                      <i className="fas fa-undo" aria-hidden />
                      Restore selected
                    </button>
                  ) : null}
                </div>
              </div>
              ) : null}
              <table className="lms-table lms-table--resources">
                <thead>
                  <tr>
                    <th className="lms-table-check-col">
                      <input
                        type="checkbox"
                        checked={
                          filteredResources.length > 0 &&
                          filteredResources.every((r) => selectedResourceIds.has(String(r._id)))
                        }
                        onChange={() => {
                          if (
                            filteredResources.length > 0 &&
                            filteredResources.every((r) => selectedResourceIds.has(String(r._id)))
                          ) {
                            setSelectedResourceIds(new Set());
                          } else {
                            setSelectedResourceIds(
                              new Set(filteredResources.map((r) => String(r._id)))
                            );
                          }
                        }}
                        aria-label="Select all resources"
                      />
                    </th>
                    <th>Title</th>
                    <th>Course</th>
                    <th>Type</th>
                    <th>Uploaded By</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredResources.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="lms-empty-cell">
                        {resources.length === 0
                          ? 'No resources for this selection.'
                          : 'No resources match your search.'}
                      </td>
                    </tr>
                  ) : (
                  filteredResources.map((r) => {
                    const rid = String(r._id);
                    const selected = selectedResourceIds.has(rid);
                    return (
                      <tr key={r._id} className={selected ? 'lms-table-row--selected' : ''}>
                        <td className="lms-table-check-col">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleResourceSelect(rid)}
                            aria-label={`Select ${r.title}`}
                          />
                        </td>
                        <td>{r.title}</td>
                        <td>{r.course?.title}</td>
                        <td>
                          <span className="lms-resource-type-pill">{r.type}</span>
                        </td>
                        <td>
                          {r.uploadedBy?.name || '—'}
                          {r.uploadedBy?.role ? ` (${r.uploadedBy.role})` : ''}
                        </td>
                        <td className="lms-table-actions">
                          {resourceListMode === 'trash' ? (
                            <>
                              <button
                                type="button"
                                className="lms-btn-restore"
                                onClick={() => restoreResource(r._id)}
                                disabled={deletingResources}
                              >
                                <i className="fas fa-undo" aria-hidden /> Restore
                              </button>
                              <button
                                type="button"
                                className="lms-btn-delete-forever"
                                onClick={() => removeResource(r._id)}
                                disabled={deletingResources}
                              >
                                <i className="fas fa-trash-alt" aria-hidden /> Delete forever
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="lms-btn-secondary"
                                onClick={() => setMaterialPreview({ kind: 'resource', item: r })}
                              >
                                <i className="fas fa-eye" aria-hidden /> Preview
                              </button>
                              <button type="button" className="lms-btn-secondary" onClick={() => startEditResource(r)}>
                                Edit
                              </button>
                              <button
                                type="button"
                                className="lms-btn-trash"
                                onClick={() => removeResource(r._id)}
                                disabled={deletingResources}
                              >
                                <i className="fas fa-archive" aria-hidden /> {QUARANTINE_LABEL}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
              {!resources.length ? <p className="lms-empty">No resources for this selection.</p> : null}
            </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="lms-panel">
          <AdminAssignmentSubmissions />
        </div>
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
