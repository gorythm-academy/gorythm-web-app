import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../../config/constants';
import { getAuthToken } from '../../../utils/authStorage';
import { lmsAdminGet, lmsAdminPost, lmsAdminPatch, lmsAdminDelete } from '../../../utils/lmsAdminApi';
import { useAdminDialog } from '../AdminDialogContext';
import { useAdminSearch } from '../../../hooks/useAdminSearch';
import { filterByKeywordSearch } from '../../../utils/adminSearch';
import ParentLinksTab from './LmsManagement/ParentLinksTab';
import { formatRelationLabel } from './LmsManagement/lmsHelpers';

const PARENT_LINKS_PAGE_SIZE = 20;
const LINK_PICKER_LIMIT = 500;
const EMPTY_LINK_FORM = { parentId: '', studentId: '', relation: 'guardian' };

const ParentLinksSection = ({ panelId = 'parents-tabpanel-parent-links' }) => {
  const { showAlert, showConfirm } = useAdminDialog();
  const parentLinkListSearch = useAdminSearch();

  const [links, setLinks] = useState([]);
  const [parents, setParents] = useState([]);
  const [students, setStudents] = useState([]);
  const [pickersLoading, setPickersLoading] = useState(false);
  const [linkForm, setLinkForm] = useState(EMPTY_LINK_FORM);
  const [parentLinksPage, setParentLinksPage] = useState(1);
  const [editingLinkId, setEditingLinkId] = useState(null);
  const [editLinkForm, setEditLinkForm] = useState({
    parentId: '',
    studentId: '',
    relation: 'guardian',
  });
  const [editLinkSaving, setEditLinkSaving] = useState(false);
  const [linksLoading, setLinksLoading] = useState(false);

  const loadLinks = useCallback(async () => {
    setLinksLoading(true);
    try {
      const res = await lmsAdminGet('/parent-links?linksOnly=1');
      if (res.success) {
        setLinks(res.links || []);
      }
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setLinksLoading(false);
    }
  }, [showAlert]);

  const fetchLinkPickers = useCallback(async (parentSearch = '', studentSearch = '') => {
    const token = getAuthToken();
    if (!token) return;
    setPickersLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [parentRes, studentRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/users`, {
          headers,
          params: {
            segment: 'parents',
            limit: LINK_PICKER_LIMIT,
            search: parentSearch.trim() || undefined,
            sortBy: 'name',
            sortOrder: 'asc',
          },
        }),
        axios.get(`${API_BASE_URL}/api/users`, {
          headers,
          params: {
            segment: 'students',
            limit: LINK_PICKER_LIMIT,
            search: studentSearch.trim() || undefined,
            sortBy: 'name',
            sortOrder: 'asc',
            unlinkedOnly: 1,
          },
        }),
      ]);
      if (parentRes.data?.success) {
        setParents((parentRes.data.users || []).filter((u) => u.role === 'parent'));
      }
      if (studentRes.data?.success) {
        setStudents((studentRes.data.users || []).filter((u) => u.role === 'student'));
      }
    } catch {
      setParents([]);
      setStudents([]);
    } finally {
      setPickersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLinks();
    fetchLinkPickers('', '');
  }, [loadLinks, fetchLinkPickers]);

  useEffect(() => {
    setParentLinksPage(1);
  }, [parentLinkListSearch.debouncedSearch]);

  const addLink = async (e) => {
    e.preventDefault();
    try {
      const res = await lmsAdminPost('/parent-links', linkForm);
      if (res.success) {
        showAlert(
          res.created === false ? 'Parent link updated.' : 'Parent linked to student.',
          'success'
        );
        setLinkForm(EMPTY_LINK_FORM);
        if (res.link) {
          setLinks((prev) => {
            const without = prev.filter((l) => String(l._id) !== String(res.link._id));
            return [res.link, ...without];
          });
        } else {
          loadLinks();
        }
        fetchLinkPickers('', '');
      } else showAlert(res.error || 'Failed', 'error');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const removeLink = async (id) => {
    const ok = await showConfirm({
      title: 'Remove link',
      message: 'Remove this parent–student link?',
      confirmLabel: 'Remove',
      type: 'warning',
    });
    if (!ok) return;
    try {
      const res = await lmsAdminDelete(`/parent-links/${id}`);
      if (res.success) {
        showAlert('Link removed.', 'success');
        setLinks((prev) => prev.filter((l) => String(l._id) !== String(id)));
        if (String(editingLinkId) === String(id)) {
          setEditingLinkId(null);
        }
        fetchLinkPickers('', '');
      } else showAlert(res.error || 'Failed', 'error');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const startEditLink = (link) => {
    const parentId = String(link.parent?._id || link.parent || '');
    const studentId = String(link.student?._id || link.student || '');
    setEditingLinkId(link._id);
    setEditLinkForm({
      parentId,
      studentId,
      relation: link.relation || 'guardian',
    });
    if (link.parent && !parents.some((p) => String(p._id) === parentId)) {
      setParents((prev) => [link.parent, ...prev]);
    }
    if (link.student && !students.some((s) => String(s._id) === studentId)) {
      setStudents((prev) => [link.student, ...prev]);
    }
  };

  const cancelEditLink = () => {
    setEditingLinkId(null);
    setEditLinkForm({ parentId: '', studentId: '', relation: 'guardian' });
  };

  const saveEditLink = async (linkId) => {
    if (!linkId || editLinkSaving) return;
    if (!editLinkForm.parentId || !editLinkForm.studentId) {
      showAlert('Parent and student are required.', 'error');
      return;
    }
    setEditLinkSaving(true);
    try {
      const res = await lmsAdminPatch(`/parent-links/${linkId}`, {
        parentId: editLinkForm.parentId,
        studentId: editLinkForm.studentId,
        relation: editLinkForm.relation,
      });
      if (res.success && res.link) {
        showAlert('Parent link updated.', 'success');
        setLinks((prev) =>
          prev.map((l) => (String(l._id) === String(linkId) ? res.link : l))
        );
        setEditingLinkId(null);
        setEditLinkForm({ parentId: '', studentId: '', relation: 'guardian' });
        fetchLinkPickers('', '');
      } else {
        showAlert(res.error || 'Failed to update link', 'error');
      }
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setEditLinkSaving(false);
    }
  };

  const filteredParentLinks = useMemo(
    () =>
      filterByKeywordSearch(links, parentLinkListSearch.debouncedSearch, (l) => [
        l.parent?.name,
        l.parent?.email,
        l.student?.name,
        l.student?.studentId,
        l.student?.email,
        l.relation,
        formatRelationLabel(l.relation),
      ]),
    [links, parentLinkListSearch.debouncedSearch]
  );

  const linkedStudentIds = useMemo(
    () => new Set(links.map((l) => String(l.student?._id || l.student)).filter(Boolean)),
    [links]
  );

  const unlinkedStudents = useMemo(
    () => students.filter((s) => !linkedStudentIds.has(String(s._id))),
    [students, linkedStudentIds]
  );

  const studentsForEditLink = useMemo(() => {
    if (!editingLinkId) return unlinkedStudents;
    const currentId = String(editLinkForm.studentId || '');
    const current = students.find((s) => String(s._id) === currentId);
    const list = [...unlinkedStudents];
    if (current && !list.some((s) => String(s._id) === currentId)) {
      list.unshift(current);
    }
    return list;
  }, [editingLinkId, editLinkForm.studentId, unlinkedStudents, students]);

  const parentLinksTotalPages = Math.max(
    1,
    Math.ceil(filteredParentLinks.length / PARENT_LINKS_PAGE_SIZE)
  );

  const pagedParentLinks = useMemo(() => {
    const start = (parentLinksPage - 1) * PARENT_LINKS_PAGE_SIZE;
    return filteredParentLinks.slice(start, start + PARENT_LINKS_PAGE_SIZE);
  }, [filteredParentLinks, parentLinksPage]);

  return (
    <ParentLinksTab
      panelId={panelId}
      tabButtonId="parents-tab-parent-links"
      addLink={addLink}
      linkForm={linkForm}
      setLinkForm={setLinkForm}
      pickersLoading={pickersLoading}
      parents={parents}
      students={unlinkedStudents}
      editStudents={studentsForEditLink}
      parentLinkListSearch={parentLinkListSearch}
      filteredParentLinks={filteredParentLinks}
      linksLoading={linksLoading}
      links={links}
      pagedParentLinks={pagedParentLinks}
      editingLinkId={editingLinkId}
      editLinkForm={editLinkForm}
      setEditLinkForm={setEditLinkForm}
      editLinkSaving={editLinkSaving}
      saveEditLink={saveEditLink}
      cancelEditLink={cancelEditLink}
      startEditLink={startEditLink}
      removeLink={removeLink}
      formatRelationLabel={formatRelationLabel}
      parentLinksTotalPages={parentLinksTotalPages}
      parentLinksPage={parentLinksPage}
      setParentLinksPage={setParentLinksPage}
    />
  );
};

export default ParentLinksSection;
