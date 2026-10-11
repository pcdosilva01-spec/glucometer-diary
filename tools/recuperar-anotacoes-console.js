/*
 * RESGATE MANUAL DO GLUCOMETER
 * Como usar: abra https://glucometer-diary.vercel.app, pressione F12 > Console,
 * cole TODO este arquivo e pressione Enter. Selecione o JSON de recuperação.
 * O script cria uma cópia da chave atual, mescla por ID e recarrega a página.
 */
(() => {
  const STORAGE_KEY = 'glucometer.personal.v1';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.append(input);
  input.addEventListener('change', async () => {
    try {
      const file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) throw new Error('O arquivo excede 10 MB.');
      const payload = JSON.parse(await file.text());
      let imported;
      if (payload && payload.application === 'Glucometer' && payload.data && typeof payload.data === 'object') imported = payload.data;
      else if (payload && payload.entries && Object.prototype.hasOwnProperty.call(payload.entries, STORAGE_KEY)) {
        const value = payload.entries[STORAGE_KEY];
        imported = typeof value === 'string' ? JSON.parse(value) : value;
      } else if (payload && typeof payload === 'object' && ['glucose', 'water', 'monitoring'].some(key => Array.isArray(payload[key]))) imported = payload;
      else throw new Error('Este arquivo não parece ser um backup do Glucometer. Nada foi alterado.');

      const valid = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && typeof item.id === 'string') : [];
      const fromFile = { glucose: valid(imported.glucose), water: valid(imported.water), monitoring: valid(imported.monitoring), settings: imported.settings && typeof imported.settings === 'object' ? imported.settings : {} };
      const incomingTotal = fromFile.glucose.length + fromFile.water.length + fromFile.monitoring.length;
      if (!incomingTotal) throw new Error('O arquivo não contém registros recuperáveis. Nada foi alterado.');

      let currentRaw = localStorage.getItem(STORAGE_KEY);
      let current = { glucose: [], water: [], monitoring: [], settings: {} };
      try { if (currentRaw) current = JSON.parse(currentRaw); } catch { /* Importação ainda pode recuperar o backup selecionado. */ }
      for (const key of ['glucose', 'water', 'monitoring']) {
        const merged = new Map(valid(current[key]).map(item => [String(item.id), item]));
        for (const item of fromFile[key]) {
          const id = String(item.id), old = merged.get(id);
          const oldTime = Date.parse(old && old.updatedAt || '') || 0;
          const newTime = Date.parse(item.updatedAt || '') || 0;
          if (!old || newTime >= oldTime) merged.set(id, item);
        }
        current[key] = [...merged.values()];
      }
      current.settings = (valid(current.glucose).length + valid(current.water).length + valid(current.monitoring).length) > incomingTotal
        ? (current.settings || fromFile.settings) : (fromFile.settings || current.settings || {});

      const count = key => current[key].length;
      const summary = `O arquivo contém ${fromFile.glucose.length} glicemias, ${fromFile.water.length} registros de água e ${fromFile.monitoring.length} anotações.\n\nA recuperação mescla por ID e não duplica IDs iguais. O estado atual será guardado em uma cópia separada antes da gravação. Continuar?`;
      if (!window.confirm(summary)) return;
      if (currentRaw) {
        try { localStorage.setItem(`glucometer.pre-recovery.${Date.now()}`, currentRaw); }
        catch { if (!window.confirm('O navegador não conseguiu criar uma cópia extra do estado atual. Você já tem o arquivo de backup? Continuar mesmo assim?')) return; }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      alert(`Resgate concluído.\n\n${count('glucose')} registros de glicose\n${count('water')} registros de água\n${count('monitoring')} anotações de refeição/insulina\n\nA página será recarregada.`);
      location.reload();
    } catch (error) {
      alert(`${error && error.message ? error.message : 'Não foi possível recuperar o arquivo.'}\n\nNenhuma nova alteração foi feita pelo resgate.`);
    } finally {
      input.remove();
    }
  }, { once: true });
  input.click();
})();
