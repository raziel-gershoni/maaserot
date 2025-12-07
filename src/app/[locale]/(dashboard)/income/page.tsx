'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

export default function IncomePage() {
  const [amount, setAmount] = useState('');
  const [percentage, setPercentage] = useState('10');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [incomes, setIncomes] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editPercentage, setEditPercentage] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const t = useTranslations('income');
  const router = useRouter();

  useEffect(() => {
    fetchIncomes();
    fetchUserSettings();
  }, []);

  const fetchUserSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setPercentage(data.settings.defaultPercent.toString());
      }
    } catch (error) {
      console.error('Failed to fetch user settings:', error);
    }
  };

  const fetchIncomes = async () => {
    try {
      const response = await fetch('/api/income');
      if (response.ok) {
        const data = await response.json();
        setIncomes(data.incomes || []);
      }
    } catch (error) {
      console.error('Failed to fetch incomes:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsLoading(true);

    try {
      const amountInAgorot = Math.round(parseFloat(amount) * 100);

      const response = await fetch('/api/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountInAgorot,
          percentage: parseInt(percentage),
          description,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to add income');
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setAmount('');
      setDescription('');
      fetchIncomes();

      // Redirect to dashboard after a moment
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    } catch (error) {
      setError('An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const startEdit = (income: any) => {
    setEditingId(income.id);
    setEditAmount((income.amount / 100).toString());
    setEditPercentage(income.percentage.toString());
    setEditDescription(income.description || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditAmount('');
    setEditPercentage('');
    setEditDescription('');
  };

  const saveEdit = async (id: string) => {
    try {
      const amountInAgorot = Math.round(parseFloat(editAmount) * 100);

      const response = await fetch('/api/income', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          amount: amountInAgorot,
          percentage: parseInt(editPercentage),
          description: editDescription,
        }),
      });

      if (response.ok) {
        fetchIncomes();
        cancelEdit();
      }
    } catch (error) {
      console.error('Failed to update income:', error);
    }
  };

  const deleteIncome = async (id: string) => {
    if (!confirm('Are you sure you want to delete this income entry?')) {
      return;
    }

    try {
      const response = await fetch(`/api/income?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchIncomes();
      }
    } catch (error) {
      console.error('Failed to delete income:', error);
    }
  };

  const formatCurrency = (agorot: number) => {
    return `₪${(agorot / 100).toFixed(2)}`;
  };

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">{t('title')}</h1>
          <p className="text-gray-700 dark:text-gray-300">{t('subtitle')}</p>
        </div>

        {/* Add Income Form */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 mb-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('addIncome')}</h2>

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
                placeholder={t('amountPlaceholder')}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent text-lg"
              />
            </div>

            <div>
              <label htmlFor="percentage" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('percentage')} (%)
              </label>
              <input
                id="percentage"
                type="number"
                min="1"
                max="100"
                required
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent text-lg"
              />
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t('defaultPercentage')}</p>
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('descriptionOptional')}
              </label>
              <input
                id="description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('descriptionPlaceholder')}
                className="w-full px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent text-lg"
              />
            </div>

            {amount && percentage && (
              <div className="bg-indigo-50 dark:bg-indigo-900/30 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
                <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200 mb-1">{t('calculatedMaaser')}</p>
                <p className="text-3xl font-bold text-indigo-900 dark:text-indigo-100">
                  ₪{((parseFloat(amount) * parseInt(percentage)) / 100).toFixed(2)}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || success}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-lg font-bold text-lg shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? t('adding') : success ? `✓ ${t('added')}` : `+ ${t('addIncome')}`}
            </button>
          </form>
        </div>

        {/* Income History */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8 border border-gray-200 dark:border-gray-700">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('incomeHistory')}</h3>
          {incomes.length > 0 ? (
            <ul className="space-y-3">
              {incomes.map((income) => (
                <li key={income.id} className="border-2 border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                  {editingId === income.id ? (
                    /* Edit Mode */
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
                          {t('amount')} (₪)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
                          {t('percentage')} (%)
                        </label>
                        <input
                          type="number"
                          value={editPercentage}
                          onChange={(e) => setEditPercentage(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
                          {t('description')}
                        </label>
                        <input
                          type="text"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border-2 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(income.id)}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white rounded-lg font-semibold transition"
                        >
                          {t('save')}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-4 py-2 bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-500 text-white rounded-lg font-semibold transition"
                        >
                          {t('cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* View Mode */
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {income.description || t('income')}
                          </span>
                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {t('maaser')}: {formatCurrency(income.maaser)} ({income.percentage}%)
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {new Date(income.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
                          {formatCurrency(income.amount)}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(income)}
                          className="px-3 py-1 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition"
                        >
                          {t('edit')}
                        </button>
                        <button
                          onClick={() => deleteIncome(income.id)}
                          className="px-3 py-1 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500 text-white rounded-lg text-sm font-semibold transition"
                        >
                          {t('delete')}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-gray-600 dark:text-gray-400 py-8">{t('noIncome')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
