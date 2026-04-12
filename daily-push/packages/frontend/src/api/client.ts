import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export default api;

// Categories
export const getCategories = () => api.get('/categories').then(r => r.data);
export const getCategoryTree = (id: number) => api.get(`/categories/${id}/tree`).then(r => r.data);
export const createCategory = (data: { title: string; icon?: string; description?: string }) =>
  api.post('/categories', data).then(r => r.data);
export const createSubcategory = (data: { category_id: number; title: string; description?: string }) =>
  api.post('/subcategories', data).then(r => r.data);

// Topics
export const getTopics = () => api.get('/topics').then(r => r.data);
export const createTopic = (data: { title: string; description?: string }) => api.post('/topics', data).then(r => r.data);
export const updateTopic = (id: number, data: object) => api.patch(`/topics/${id}`, data).then(r => r.data);
export const deleteTopic = (id: number) => api.delete(`/topics/${id}`);
export const generateQueue = (id: number) => api.post(`/topics/${id}/generate`).then(r => r.data);
export const enrichTopic = (id: number) => api.post(`/topics/${id}/enrich`).then(r => r.data);

// Study Items
export const getStudyItems = () => api.get('/study-items').then(r => r.data);
export const getStudyItemsByTopic = (topicId: number) =>
  api.get(`/study-items?topic_id=${topicId}`).then(r => r.data);
export const getCurrentItem = () => api.get('/study-items/current').then(r => r.data);
export const completeItem = (id: number, data?: { duration_mins?: number; notes?: string }) =>
  api.post(`/study-items/${id}/complete`, data || {}).then(r => r.data);
export const skipItem = (id: number) => api.post(`/study-items/${id}/skip`).then(r => r.data);

// Sessions
export const getSessions = (page = 1) => api.get(`/sessions?page=${page}`).then(r => r.data);
export const getStreak = () => api.get('/sessions/streak').then(r => r.data);
export const getCalendar = () => api.get('/sessions/calendar').then(r => r.data);

// News
export const getNewsInterests = () => api.get('/news/interests').then(r => r.data);
export const addNewsInterest = (tag: string) => api.post('/news/interests', { tag }).then(r => r.data);
export const deleteNewsInterest = (id: number) => api.delete(`/news/interests/${id}`);
export const getNewsFeed = () => api.get('/news/feed').then(r => r.data);
export const fetchNews = () => api.post('/news/fetch').then(r => r.data);

// Digest
export const getDigestHistory = () => api.get('/digest/history').then(r => r.data);
export const previewDigest = () => api.post('/digest/preview').then(r => r.data);
export const sendDigest = () => api.post('/digest/send').then(r => r.data);

// Settings
export const getSettings = () => api.get('/settings').then(r => r.data);
export const updateSettings = (data: object) => api.patch('/settings', data).then(r => r.data);
