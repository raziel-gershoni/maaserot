'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface Charity {
  id: string;
  name: string;
  amount: number;
  isActive: boolean;
}

export default function CharitiesPage() {
  const [charities, setCharities] = useState<Charity[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Edit state
  const [editingCharity, setEditingCharity] = useState<Charity | null>(null);
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const t = useTranslations('charities');

  useEffect(() => {
    fetchCharities();
  }, []);

  const fetchCharities = async () => {
    try {
      const response = await fetch('/api/charities');
      if (response.ok) {
        const data = await response.json();
        setCharities(data.charities || []);
      }
    } catch (error) {
      console.error('Failed to fetch charities:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsLoading(true);

    try {
      const amountInAgorot = Math.round(parseFloat(amount) * 100);

      const response = await fetch('/api/charities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          amount: amountInAgorot,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to add charity');
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setName('');
      setAmount('');
      fetchCharities();
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      setError('An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const response = await fetch('/api/charities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          isActive: !currentStatus,
        }),
      });

      if (response.ok) {
        fetchCharities();
      }
    } catch (error) {
      console.error('Failed to toggle charity:', error);
    }
  };

  const deleteCharity = async (id: string) => {
    if (!confirm(t('deleteConfirm'))) {
      return;
    }

    try {
      const response = await fetch(`/api/charities?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchCharities();
      }
    } catch (error) {
      console.error('Failed to delete charity:', error);
    }
  };

  const openEdit = (charity: Charity) => {
    setEditingCharity(charity);
    setEditName(charity.name);
    setEditAmount((charity.amount / 100).toString());
  };

  const closeEdit = () => {
    setEditingCharity(null);
    setEditName('');
    setEditAmount('');
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCharity) return;

    setIsEditing(true);

    try {
      const amountInAgorot = Math.round(parseFloat(editAmount) * 100);

      const response = await fetch('/api/charities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCharity.id,
          name: editName,
          amount: amountInAgorot,
        }),
      });

      if (response.ok) {
        fetchCharities();
        closeEdit();
      }
    } catch (error) {
      console.error('Failed to edit charity:', error);
    } finally {
      setIsEditing(false);
    }
  };

  const formatCurrency = (agorot: number) => {
    return `₪${(agorot / 100).toFixed(2)}`;
  };

  const totalMonthly = charities
    .filter((c) => c.isActive)
    .reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">{t('title')}</h1>
          <p className="text-gray-700 dark:text-gray-300">{t('subtitle')}</p>
        </div>

        {/* Total Monthly */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-xl shadow-lg p-6 mb-6 border-2 border-indigo-200 dark:border-indigo-700">
          <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200 mb-1">{t('totalMonthlyCommitment')}</p>
          <p className="text-4xl font-bold text-indigo-900 dark:text-indigo-100">{formatCurrency(totalMonthly)}</p>
          <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-1">
            {charities.filter((c) => c.isActive).length} {t('activeCharities')}
          </p>
        </div>

        {/* Add Charity Form */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 mb-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('addCharity')}</h2>

          {success && (
            <div className="bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 p-4 rounded-lg mb-4 border border-green-200 dark:border-green-700">
              ✓ {t('addedSuccess')}
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-4 rounded-lg mb-4 border border-red-200 dark:border-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('name')}
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent text-lg"
              />
            </div>

            <div>
              <label htmlFor="amount" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('amount')} (₪)
              </label>
              <input
                id="amount"
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100.00"
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent text-lg"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || success}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 text-white rounded-lg font-bold text-lg shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? t('adding') : success ? `✓ ${t('added')}` : `+ ${t('addCharity')}`}
            </button>
          </form>
        </div>

        {/* Charities List */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 border border-gray-200 dark:border-gray-700">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('yourFixedCharities')}</h3>
          {charities.length > 0 ? (
            <ul className="space-y-3">
              {charities.map((charity) => (
                <li
                  key={charity.id}
                  className={`border-2 rounded-lg p-4 transition ${
                    charity.isActive
                      ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 opacity-60'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {charity.name}
                        </span>
                        <span
                          className={`text-xs px-2 py-1 rounded font-bold ${
                            charity.isActive
                              ? 'bg-green-600 dark:bg-green-700 text-white'
                              : 'bg-gray-400 dark:bg-gray-600 text-white'
                          }`}
                        >
                          {charity.isActive ? t('active') : t('inactive')}
                        </span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                        {formatCurrency(charity.amount)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(charity)}
                        className="px-3 py-2 bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-500 text-white rounded-lg font-semibold transition"
                        title={t('edit')}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => toggleActive(charity.id, charity.isActive)}
                        className={`px-3 py-2 rounded-lg font-semibold transition ${
                          charity.isActive
                            ? 'bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-500 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 text-white'
                        }`}
                      >
                        {charity.isActive ? t('pause') : t('activate')}
                      </button>
                      <button
                        onClick={() => deleteCharity(charity.id)}
                        className="px-3 py-2 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500 text-white rounded-lg font-semibold transition"
                      >
                        {t('delete')}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">{t('noCharities')}</p>
              <p className="text-gray-500 dark:text-gray-500">{t('addFirst')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingCharity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-md border border-gray-200 dark:border-gray-700">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{t('editCharity')}</h3>

            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label htmlFor="editName" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                  {t('name')}
                </label>
                <input
                  id="editName"
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent text-lg"
                />
              </div>

              <div>
                <label htmlFor="editAmount" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                  {t('amount')} (₪)
                </label>
                <input
                  id="editAmount"
                  type="number"
                  step="0.01"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent text-lg"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg font-bold transition"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isEditing}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 text-white rounded-lg font-bold transition disabled:opacity-50"
                >
                  {isEditing ? t('saving') : t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
