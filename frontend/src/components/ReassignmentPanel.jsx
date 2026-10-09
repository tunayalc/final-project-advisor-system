import { useRef, useState } from 'react';
import { Check, RefreshCcw } from 'lucide-react';
import api from '../api';

const METHOD_LABELS = {
  preference: 'Tercihiyle yerleşti',
  fallback: 'Boş kontenjandan yerleşti',
  unplaced: 'Atanamadı',
};

const formatNumber = (value) => value == null ? '—' : Number(value).toLocaleString('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function ReassignmentPanel({ dataVersion, disabled, onApplied, onBusyChange }) {
  const [archive, setArchive] = useState(null);
  const [archiveError, setArchiveError] = useState(false);
  const [reading, setReading] = useState(false);
  const [operation, setOperation] = useState('');
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const fileInput = useRef(null);
  const requestSequence = useRef(0);
  const preview = result?.dataVersion === dataVersion ? result.data : null;
  const busy = Boolean(operation) || reading || disabled;

  const selectArchive = async (event) => {
    const file = event.target.files?.[0];
    const sequence = ++requestSequence.current;
    setResult(null);
    setNotice({ type: '', text: '' });
    setArchive(null);
    setArchiveError(false);
    if (!file) {
      setReading(false);
      return;
    }
    setReading(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Tercih geçmişi dosyası en fazla 5 MB olabilir.');
      const text = await file.text();
      if (sequence !== requestSequence.current) return;
      if (!text.trim()) throw new Error('Seçilen dosya boş. Tercih geçmişi dosyasını seçin.');
      setArchive({ source_name: file.name, archive_text: text });
      setArchiveError(false);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      setArchiveError(true);
      setNotice({ type: 'error', text: error.message || 'Dosya okunamadı. Lütfen yeniden seçin.' });
      if (fileInput.current) fileInput.current.value = '';
    } finally {
      if (sequence === requestSequence.current) setReading(false);
    }
  };

  const clearArchive = () => {
    ++requestSequence.current;
    setArchive(null);
    setArchiveError(false);
    setReading(false);
    setResult(null);
    setNotice({ type: '', text: '' });
    if (fileInput.current) fileInput.current.value = '';
  };

  const runPreview = async () => {
    if (busy || archiveError) return;
    const sequence = ++requestSequence.current;
    setOperation('preview');
    onBusyChange(true);
    setResult(null);
    setNotice({ type: '', text: '' });
    try {
      const response = await api.post('/admin/reassignment/preview', archive || {});
      if (sequence === requestSequence.current) {
        setResult({ data: response.data, dataVersion, source: archive });
      }
    } catch (error) {
      if (sequence === requestSequence.current) {
        setNotice({ type: 'error', text: error.response?.data?.error || 'Dağıtım önizlemesi hazırlanamadı.' });
      }
    } finally {
      setOperation('');
      onBusyChange(false);
    }
  };

  const applyPreview = async () => {
    if (busy || !preview) return;
    setOperation('apply');
    onBusyChange(true);
    setNotice({ type: '', text: '' });
    try {
      const response = await api.post('/admin/reassignment/apply', {
        ...(result.source || {}),
        fingerprint: preview.fingerprint,
      });
      setResult(null);
      setNotice({ type: 'success', text: 'Yeni dağıtım uygulandı.' });
      await onApplied(response.data);
    } catch (error) {
      const stale = error.response?.status === 409;
      if (stale) setResult(null);
      setNotice({
        type: 'error',
        text: stale
          ? 'Önizlemeden sonra bilgiler değişti. Güncel bilgilerle yeniden önizleme hazırlayın.'
          : error.response?.data?.error || 'Dağıtım uygulanamadı. Sonuçları yenileyip yeniden önizleme hazırlayın.',
      });
    } finally {
      setOperation('');
      onBusyChange(false);
    }
  };

  const changes = preview?.assignments.filter((assignment) => assignment.changed) || [];

  return (
    <section id="reassignment-panel" className="panel reassignment-panel" aria-labelledby="reassignment-title" aria-busy={busy}>
      <div className="section-header">
        <div>
          <p className="eyebrow">Kayıtlı tercihlerle dağıtım</p>
          <h2 id="reassignment-title">Bütün öğrencileri yeniden yerleştir</h2>
        </div>
        <span className="icon-chip"><RefreshCcw size={18} /></span>
      </div>
      <p className="muted-copy">
        Her bölümde önce hocalara eşit kontenjan verilerek geçici yerleştirme yapılır.
        Yerleştirme puanında GANO %80, tercih sırası %20 etkilidir. Eşit kontenjanını en erken
        dolduran hocalar kalan yerlerden birer tane alır. Son kontenjanlarla bütün onaylı
        öğrenciler baştan yerleştirilir.
      </p>
      <p className="muted-copy">
        İndirdiğiniz tercih geçmişini seçebilirsiniz. Dosyadaki her güncel öğrencinin son kayıtlı
        tercihleri kullanılır. Dosya seçmezseniz sistemde kayıtlı tercihler kullanılır.
      </p>
      <div className="stack-form">
        <label className="field-block">
          <span>Tercih geçmişi dosyası (isteğe bağlı, JSONL)</span>
          <input ref={fileInput} type="file" accept=".jsonl,.ndjson,application/x-ndjson"
            className="app-input" onChange={selectArchive} disabled={Boolean(operation) || disabled}
            aria-describedby="reassignment-source" />
        </label>
        <p id="reassignment-source" className="muted-copy reassignment-source">
          {reading ? 'Dosya okunuyor…' : archiveError ? 'Dosya kullanılamıyor. Başka bir dosya seçin veya sistemdeki tercihlere geçin.' : archive ? `Seçilen kaynak: ${archive.source_name}` : 'Kaynak: Sistemde kayıtlı tercihler'}
        </p>
        <div className="action-row">
          <button type="button" className="btn btn-primary" onClick={runPreview} disabled={busy || archiveError}>
            <RefreshCcw size={16} />
            {operation === 'preview' ? 'Önizleme hazırlanıyor' : 'Dağıtım önizlemesini hazırla'}
          </button>
          {(archive || archiveError) && <button type="button" className="btn btn-outline" onClick={clearArchive} disabled={busy}>
            Sistemdeki tercihleri kullan
          </button>}
        </div>
      </div>

      {notice.text && <p role="status" className={`notice notice-${notice.type}`}>{notice.text}</p>}
      {result && !preview && <p className="notice notice-info" role="status">
        Veriler yenilendi. Güncel bilgilerle yeniden önizleme hazırlayın.
      </p>}

      {preview && <div className="stack-layout reassignment-preview" aria-live="polite">
        <h3>Yeni dağıtımın önizlemesi</h3>
        <p className="muted-copy">Kaynak: {preview.source?.name || archive?.source_name || 'Sistemde kayıtlı tercihler'}. Henüz uygulanmadı.</p>
        <div className="stat-grid reassignment-stats">
          <article className="stat-card"><span>Dağıtıma alınan öğrenci</span><strong>{preview.stats.totalStudents}</strong></article>
          <article className="stat-card"><span>Tercihiyle yerleşen</span><strong>{preview.stats.placedByPreference}</strong></article>
          <article className="stat-card"><span>Boş kontenjandan yerleşen</span><strong>{preview.stats.placedRandomly}</strong></article>
          <article className="stat-card"><span>Atanamayan</span><strong>{preview.stats.unplaced}</strong></article>
          <article className="stat-card"><span>Danışmanı değişen</span><strong>{preview.stats.changed}</strong></article>
        </div>
        <h3>Hoca sırası ve yeni kontenjanlar</h3>
        <p className="muted-copy">Sıra her bölümde ayrı hesaplanır. Geçici yerleştirmede eşit kontenjanını önce dolduran hocalar üstte yer alır.</p>
        <div className="table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">Bölüm içindeki öncelik sırasına göre yeni danışman kontenjanları</caption>
            <thead><tr><th scope="col">Bölüm içi sıra</th><th scope="col">Danışman</th><th scope="col">Bölüm</th><th scope="col">Yeni kontenjan</th><th scope="col">Yerleşen</th></tr></thead>
            <tbody>{preview.faculty.map((faculty) => <tr key={faculty.faculty_id}>
              <td>{faculty.priority}</td><td><strong>{faculty.faculty_name}</strong></td><td>{faculty.department_name}</td>
              <td>{faculty.base_quota}</td><td>{faculty.current_quota}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <h3>Danışmanı değişen öğrenciler</h3>
        {changes.length === 0 ? <p className="empty-state">Öğrencilerin danışmanlarında değişiklik yok.</p> : <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th scope="col">Öğrenci</th><th scope="col">Önceki danışman</th><th scope="col">Yeni danışman</th><th scope="col">Yerleştirme biçimi</th></tr></thead>
            <tbody>{changes.map((assignment) => <tr key={assignment.student_id}>
              <td><strong>{assignment.student_name}</strong><span>{assignment.student_email}</span></td>
              <td>{assignment.previous_faculty_name || 'Atanmamış'}</td><td>{assignment.faculty_name || 'Atanamadı'}</td>
              <td>{METHOD_LABELS[assignment.method]}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <p className="muted-copy">
          Boş kontenjandan yerleşen öğrenciler, tercihlerindeki hocalara yerleşemediği veya geçerli
          tercihi bulunmadığı için bölümde kalan yerlere atanır. Bu öğrencilerde tercih sırası ve
          tercih yerleştirme puanı gösterilmez.
        </p>
        <details className="reassignment-details">
          <summary>Bütün öğrencilerin yeni yerleşimlerini göster ({preview.assignments.length})</summary>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th scope="col">Öğrenci</th><th scope="col">Bölüm</th><th scope="col">GANO</th><th scope="col">Yeni danışman</th><th scope="col">Tercih sırası</th><th scope="col">Puan</th><th scope="col">Yerleştirme biçimi</th></tr></thead>
              <tbody>{preview.assignments.map((assignment) => <tr key={assignment.student_id}>
                <td><strong>{assignment.student_name}</strong><span>{assignment.student_email}</span></td><td>{assignment.department_name}</td>
                <td>{formatNumber(assignment.gano)}</td><td>{assignment.faculty_name || 'Atanamadı'}</td>
                <td>{assignment.method === 'preference' ? assignment.preference_rank : '—'}</td>
                <td>{assignment.method === 'preference' ? formatNumber(assignment.score) : '—'}</td>
                <td>{METHOD_LABELS[assignment.method]}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </details>
        <p className="muted-copy">Uyguladığınızda mevcut atamalar bu dağıtımla güncellenir. Tercih geçmişi ve önceki atamalar işlem geçmişinde saklanır.</p>
        <div className="action-row">
          <button type="button" className="btn btn-primary" onClick={applyPreview} disabled={busy}>
            <Check size={16} />{operation === 'apply' ? 'Dağıtım uygulanıyor' : 'Bu dağıtımı uygula'}
          </button>
        </div>
      </div>}
    </section>
  );
}
