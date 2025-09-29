import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Pencil, Trash2, Heart } from 'lucide-react';

// Define Source interface for better type safety
interface Source {
  id: number;
  name: string;
  url: string;
  reliability_score: number | null; // Allow null for reliability score
  created_at: string;
  updated_at: string;
}

function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [editSourceName, setEditSourceName] = useState('');
  const [editSourceUrl, setEditSourceUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchSources();
    loadFavorites();
  }, []);

  const loadFavorites = () => {
    try {
      const stored = localStorage.getItem('favoriteSourceIds');
      if (stored) {
        setFavoriteIds(new Set(JSON.parse(stored)));
      }
    } catch (error) {
      console.error('Error loading favorites:', error);
    }
  };

  const saveFavorites = (favorites: Set<number>) => {
    try {
      localStorage.setItem('favoriteSourceIds', JSON.stringify([...favorites]));
    } catch (error) {
      console.error('Error saving favorites:', error);
    }
  };

  const toggleFavorite = (sourceId: number) => {
    const newFavorites = new Set(favoriteIds);
    if (newFavorites.has(sourceId)) {
      newFavorites.delete(sourceId);
    } else {
      newFavorites.add(sourceId);
    }
    setFavoriteIds(newFavorites);
    saveFavorites(newFavorites);
  };

  const fetchSources = async () => {
    try {
      const response = await axios.get<Source[]>('/api/sources');
      setSources(response.data);
    } catch (err) {
      setError('Failed to fetch sources.');
      console.error('Error fetching sources:', err);
    }
  };

  const addSource = async () => {
    if (!newSourceName.trim() || !newSourceUrl.trim()) {
      setError('Source name and URL are required.');
      return;
    }
    try {
      await axios.post('/api/sources', {
        name: newSourceName,
        url: newSourceUrl,
      });
      setNewSourceName('');
      setNewSourceUrl('');
      fetchSources();
    } catch (err) {
      setError('Failed to add source.');
      console.error('Error adding source:', err);
    }
  };

  const deleteSource = async (id: number) => {
    try {
      await axios.delete(`/api/sources/${id}`);
      fetchSources();
    } catch (err) {
      setError('Failed to delete source.');
      console.error('Error deleting source:', err);
    }
  };

  const startEditing = (source: Source) => {
    setEditingSource(source);
    setEditSourceName(source.name);
    setEditSourceUrl(source.url);
  };

  const cancelEditing = () => {
    setEditingSource(null);
  };

  const updateSource = async () => {
    if (!editingSource || !editSourceName.trim() || !editSourceUrl.trim()) {
      setError('Source name and URL are required.');
      return;
    }
    try {
      await axios.put(`/api/sources/${editingSource.id}`, {
        name: editSourceName,
        url: editSourceUrl,
      });
      setEditingSource(null);
      fetchSources();
    } catch (err) {
      setError('Failed to update source.');
      console.error('Error updating source:', err);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Manage Horoscope Sources</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Add New Source</h2>
        <div className="flex flex-col md:flex-row gap-2">
          <input
            type="text"
            placeholder="Source Name"
            value={newSourceName}
            onChange={(e) => setNewSourceName(e.target.value)}
            className="input-field"
          />
          <input
            type="url"
            placeholder="Source URL (e.g., https://www.example.com/horoscope)"
            value={newSourceUrl}
            onChange={(e) => setNewSourceUrl(e.target.value)}
            className="input-field"
          />
          <button onClick={addSource} className="btn btn-primary">Add Source</button>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2">Existing Sources</h2>
        {sources.length === 0 ? (
          <p>No sources found. Add one above.</p>
        ) : (
          <div className="space-y-6">
            {/* Favorite Sources */}
            {sources.filter(source => favoriteIds.has(source.id)).length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-card-foreground mb-3 flex items-center gap-2">
                  <Heart size={18} className="text-red-500" fill="currentColor" />
                  Favorite Sources
                </h3>
                <ul className="space-y-4">
                  {sources
                    .filter(source => favoriteIds.has(source.id))
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((source) => (
              <li key={source.id} className="bg-white shadow p-4 rounded-md flex flex-col md:flex-row justify-between items-center border">
                        {editingSource?.id === source.id ? (
                          <div className="flex flex-col md:flex-row gap-2 w-full">
                            <input
                              type="text"
                              value={editSourceName}
                              onChange={(e) => setEditSourceName(e.target.value)}
                              className="input-field flex-grow"
                            />
                            <input
                              type="url"
                              value={editSourceUrl}
                              onChange={(e) => setEditSourceUrl(e.target.value)}
                              className="input-field flex-grow"
                            />
                            <div className="flex gap-2">
                              <button onClick={updateSource} className="btn btn-success">Save</button>
                              <button onClick={cancelEditing} className="btn btn-secondary">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex-grow flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
                              <span className="font-medium text-lg text-gray-800">
                                {source.name}
                              </span>
                              <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                                {source.url}
                              </a>
                              {/* Reliability Score Display */}
                              {source.reliability_score !== null && source.reliability_score !== undefined && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-muted-foreground">Affidabilità:</span>
                                  <span className="text-sm font-medium">
                                    {Number(source.reliability_score).toFixed(1)}/10
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 mt-2 md:mt-0">
                              <button 
                                onClick={() => toggleFavorite(source.id)} 
                                className={`p-2 rounded-md transition-colors border ${
                                  favoriteIds.has(source.id) 
                                    ? 'text-red-500 hover:text-red-700 bg-red-50 border-red-200' 
                                    : 'text-gray-400 hover:text-red-500 bg-gray-50 border-gray-200 hover:bg-red-50'
                                }`}
                                title={favoriteIds.has(source.id) ? 'Remove from favorites' : 'Add to favorites'}
                              >
                                <Heart size={18} fill={favoriteIds.has(source.id) ? 'currentColor' : 'none'} />
                              </button>
                              <button onClick={() => startEditing(source)} className="text-blue-600 hover:text-blue-800 p-2 rounded-md bg-blue-50 border border-blue-200">
                                <Pencil size={18} />
                              </button>
                              <button onClick={() => deleteSource(source.id)} className="text-red-600 hover:text-red-800 p-2 rounded-md bg-red-50 border border-red-200">
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {/* Other Sources */}
            {sources.filter(source => !favoriteIds.has(source.id)).length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-card-foreground mb-3">
                  {sources.filter(source => favoriteIds.has(source.id)).length > 0 ? 'Other Sources' : 'All Sources'}
                </h3>
                <ul className="space-y-4">
                  {sources
                    .filter(source => !favoriteIds.has(source.id))
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((source) => (
                      <li key={source.id} className="bg-white shadow p-4 rounded-md flex flex-col md:flex-row justify-between items-center border">
                        {editingSource?.id === source.id ? (
                          <div className="flex flex-col md:flex-row gap-2 w-full">
                            <input
                              type="text"
                              value={editSourceName}
                              onChange={(e) => setEditSourceName(e.target.value)}
                              className="input-field flex-grow"
                            />
                            <input
                              type="url"
                              value={editSourceUrl}
                              onChange={(e) => setEditSourceUrl(e.target.value)}
                              className="input-field flex-grow"
                            />
                            <div className="flex gap-2">
                              <button onClick={updateSource} className="btn btn-success">Save</button>
                              <button onClick={cancelEditing} className="btn btn-secondary">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex-grow flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
                              <span className="font-medium text-lg text-gray-800">
                                {source.name}
                              </span>
                              <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                                {source.url}
                              </a>
                              {/* Reliability Score Display */}
                              {source.reliability_score !== null && source.reliability_score !== undefined && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-muted-foreground">Affidabilità:</span>
                                  <span className="text-sm font-medium">
                                    {Number(source.reliability_score).toFixed(1)}/10
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 mt-2 md:mt-0">
                              <button 
                                onClick={() => toggleFavorite(source.id)} 
                                className={`p-2 rounded-md transition-colors border ${
                                  favoriteIds.has(source.id) 
                                    ? 'text-red-500 hover:text-red-700 bg-red-50 border-red-200' 
                                    : 'text-gray-400 hover:text-red-500 bg-gray-50 border-gray-200 hover:bg-red-50'
                                }`}
                                title={favoriteIds.has(source.id) ? 'Remove from favorites' : 'Add to favorites'}
                              >
                                <Heart size={18} fill={favoriteIds.has(source.id) ? 'currentColor' : 'none'} />
                              </button>
                              <button onClick={() => startEditing(source)} className="text-blue-600 hover:text-blue-800 p-2 rounded-md bg-blue-50 border border-blue-200">
                                <Pencil size={18} />
                              </button>
                              <button onClick={() => deleteSource(source.id)} className="text-red-600 hover:text-red-800 p-2 rounded-md bg-red-50 border border-red-200">
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SourcesPage;