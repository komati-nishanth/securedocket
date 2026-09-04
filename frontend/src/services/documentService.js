import api from './api';

export const documentService = {
  getDocuments: async (params = {}) => {
    return api.get('/documents', { params });
  },

  getDocumentById: async (id) => {
    return api.get(`/documents/${id}`);
  },

  uploadDocument: async (formData, onProgress) => {
    return api.post('/documents', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      },
    });
  },

  getDocumentViewUrl: async (id) => {
    return api.get(`/documents/${id}/view`);
  },

  getPresignedViewUrl: async (id) => {
    return api.get(`/documents/${id}/view`);
  },

  getDocumentDownloadUrl: async (id) => {
    return api.get(`/documents/${id}/download-url`);
  },

  getDocumentVersions: async (id) => {
    return api.get(`/documents/${id}/versions`);
  },

  getDocumentVersion: async (id, versionNumber) => {
    return api.get(`/documents/${id}/versions/${versionNumber}`);
  },

  getVersionViewUrl: async (id, versionNumber) => {
    return api.get(`/documents/${id}/versions/${versionNumber}/view`);
  },

  createDocumentVersion: async (id, formData) => {
    return api.post(`/documents/${id}/versions`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  compareVersions: async (id, v1, v2) => {
    return api.get(`/documents/${id}/versions/compare`, {
      params: { v1, v2 },
    });
  },
};
