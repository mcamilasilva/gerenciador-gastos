if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

let state = {
    currentScreen: 'home',
    selectedYearMonth: new Date().toISOString().slice(0, 7),
    data: loadData(),
    summaryType: 'mes',
    successMessage: 'salvo',
    successArticle: 'o',
    successReturnScreen: 'home',
    activeContaParaPagar: null,
    gastoDetalhesAberto: false
};

function loadData() {
    const saved = localStorage.getItem('meus_gastos_data');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            return {
                receitas: Array.isArray(parsed.receitas) ? parsed.receitas : [],
                despesas: Array.isArray(parsed.despesas) ? parsed.despesas : [],
                contasFixas: Array.isArray(parsed.contasFixas) ? parsed.contasFixas : [],
                pagamentosContas: (parsed.pagamentosContas && typeof parsed.pagamentosContas === 'object') ? parsed.pagamentosContas : {}
            };
        } catch (e) {}
    }
    return { receitas: [], despesas: [], contasFixas: [], pagamentosContas: {} };
}

function saveData() {
    localStorage.setItem('meus_gastos_data', JSON.stringify(state.data));
}

function baixarBackupManualJson() {
    try {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.data, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "meu_backup_gastos.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    } catch (e) {
        alert('Não foi possível gerar o arquivo de backup.');
    }
}

const fmtMoeda = (val) => {
    const num = parseFloat(val);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(isNaN(num) ? 0 : num);
};
const arredondar = (val) => Math.round(((isNaN(val) ? 0 : val) + Number.EPSILON) * 100) / 100;
const hojeIso = () => new Date().toISOString().slice(0, 10);

function formatarNomeMes(yearMonth) {
    const [ano, mes] = yearMonth.split('-');
    const dataRef = new Date(ano, mes - 1, 1);
    const nome = dataRef.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    return nome.charAt(0).toUpperCase() + nome.slice(1);
}

function isMesPassado(yearMonth) {
    const hoje = new Date();
    const atualYearMonth = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    return yearMonth < atualYearMonth;
}

function renderHeaderMesFixo() {
    return `
        <div style="margin-bottom: 16px;">
            <div class="header-mes-fixo" style="margin-bottom: 4px;">🗓️ ${formatarNomeMes(state.selectedYearMonth)}</div>
        </div>
    `;
}

function calcularDadosBannerHome() {
    const [ano, mes] = state.selectedYearMonth.split('-').map(Number);
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth() + 1;

    const isPassado = (ano < anoAtual) || (ano === anoAtual && mes < mesAtual);
    const diasNoMes = new Date(ano, mes, 0).getDate();

    const recebido = arredondar(
        state.data.receitas
            .filter(r => r.dataIso && r.dataIso.startsWith(state.selectedYearMonth))
            .reduce((acc, r) => acc + (parseFloat(r.valor) || 0), 0)
    );

    const avulsas = arredondar(
        state.data.despesas
            .filter(d => d.dataIso && d.dataIso.startsWith(state.selectedYearMonth))
            .reduce((acc, d) => acc + (parseFloat(d.valor) || 0), 0)
    );

    let totalContasPagasMes = 0;
    let totalContasPendentesMes = 0;
    state.data.contasFixas.forEach(c => {
        const inicioOk = c.mesInicioIso <= state.selectedYearMonth;
        const fimOk = !c.mesFimIso || c.mesFimIso >= state.selectedYearMonth;
        if (!inicioOk || !fimOk) return;

        const pagamentoInfo = state.data.pagamentosContas[`${c.id}_${state.selectedYearMonth}`];
        if (pagamentoInfo !== undefined && pagamentoInfo.valor !== undefined) {
            totalContasPagasMes += parseFloat(pagamentoInfo.valor) || 0;
        } else {
            totalContasPendentesMes += parseFloat(c.valorMedio) || 0;
        }
    });

    const contasFixasTotalMes = arredondar(totalContasPagasMes + totalContasPendentesMes);
    const gastoTotalMes = arredondar(avulsas + contasFixasTotalMes);
    const restanteMes = arredondar(recebido - gastoTotalMes);

    let corBorda = '#047857';
    if (restanteMes < 0) {
        corBorda = '#dc2626';
    }

    if (isPassado) {
        const restoFinal = isNaN(restanteMes) ? 0 : restanteMes;
        const isNegativo = restoFinal < 0;
        const corValor = isNegativo ? '#dc2626' : '#047857';
        const tituloCard = isNegativo ? 'Valor que faltou:' : 'Valor que sobrou guardado:';
        
        const textoBanner = `
            <div style="color: #334155; font-size: 16px; margin-bottom: 4px;">${tituloCard}</div>
            <span style="font-size: 26px; font-weight: 800; color: ${corValor};">${fmtMoeda(restoFinal)}</span>
        `;
        return { textoBanner, corBorda };
    } else {
        const diaHoje = hoje.getDate();
        const diasRestantesNoMes = Math.max(1, (diasNoMes - diaHoje) + 1);

        const dFim = (ano === hoje.getFullYear() && mes === hoje.getMonth() + 1) ? new Date(hoje) : new Date(ano, mes - 1, diasNoMes);
        const diaSemanaHoje = dFim.getDay();
        const diasAteDomingo = diaSemanaHoje === 0 ? 1 : (7 - diaSemanaHoje + 1);
        const diasProjecaoSemana = Math.min(diasAteDomingo, diasRestantesNoMes);

        const dInicioSemana = new Date(dFim);
        dInicioSemana.setDate(dFim.getDate() - (diaSemanaHoje === 0 ? 6 : diaSemanaHoje - 1));
        const inicioStr = dInicioSemana.toISOString().slice(0, 10);
        const fimStr = dFim.toISOString().slice(0, 10);

        const gastoPeriodoSemana = arredondar(
            state.data.despesas
                .filter(d => !d.contaFixaId && d.dataIso && d.dataIso >= inicioStr && d.dataIso <= fimStr)
                .reduce((acc, d) => acc + (parseFloat(d.valor) || 0), 0)
        );

        const baseCalculoSemana = Math.max(0, recebido - contasFixasTotalMes);
        const disponivelSemana = arredondar(((baseCalculoSemana / diasRestantesNoMes) * diasProjecaoSemana) - gastoPeriodoSemana);

        if (disponivelSemana < 0 || restanteMes < 0) {
            corBorda = '#dc2626';
        } else {
            corBorda = '#047857';
        }

        const dispMesFinal = isNaN(restanteMes) ? 0 : restanteMes;
        const dispSemanaFinal = isNaN(disponivelSemana) ? 0 : disponivelSemana;

        const corValorSemana = dispSemanaFinal < 0 ? '#dc2626' : '#047857';
        const corValorMes = dispMesFinal < 0 ? '#dc2626' : '#047857';

        const textoBanner = `
            <div style="font-size: 14px; color: #334155; margin-bottom: 8px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">⭐ Valor Disponível</div>
            <div style="display: flex; justify-content: space-around; gap: 8px;">
                <div style="flex: 1; border-right: 2px solid #e2e8f0; padding-right: 4px;">
                    <span style="font-size: 13px; color: #475569;">Até Domingo (Semana)</span><br>
                    <span style="font-size: 20px; font-weight: 800; color: ${corValorSemana};">${fmtMoeda(dispSemanaFinal)}</span>
                </div>
                <div style="flex: 1; padding-left: 4px;">
                    <span style="font-size: 13px; color: #475569;">No Mês Inteiro</span><br>
                    <span style="font-size: 20px; font-weight: 800; color: ${corValorMes};">${fmtMoeda(dispMesFinal)}</span>
                </div>
            </div>
        `;

        return { textoBanner, corBorda };
    }
}

function render() {
    const app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = '';

    try {
        verificarContasVencendoHoje();

        switch (state.currentScreen) {
            case 'home': app.appendChild(renderHome()); break;
            case 'rec': app.appendChild(renderFormReceita()); break;
            case 'desp': app.appendChild(renderFormDespesa()); break;
            case 'conta': app.appendChild(renderFormContaFixa()); break;
            case 'period': app.appendChild(renderChoosePeriod()); break;
            case 'summary': app.appendChild(renderSummary()); break;
            case 'success': app.appendChild(renderSuccess()); break;
            case 'confirm-pagamento': app.appendChild(renderConfirmPagamento()); break;
            default: 
                state.currentScreen = 'home';
                app.appendChild(renderHome());
                break;
        }
    } catch (err) {
        console.error("Erro no render:", err);
        state.currentScreen = 'home';
        app.appendChild(renderHome());
    }
}

function renderHome() {
    const div = document.createElement('div');
    const nomeMesFormatado = formatarNomeMes(state.selectedYearMonth);
    const { textoBanner, corBorda } = calcularDadosBannerHome();

    const [ano, mes] = state.selectedYearMonth.split('-').map(Number);
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth() + 1;
    const isMesAtualOuFuturoSelecao = (ano > anoAtual) || (ano === anoAtual && mes >= mesAtual);

    div.innerHTML = `
        <div>
            <div class="alert-box" id="aviso-vencimento-hoje" style="display:none;"></div>

            <div class="banner-semana" style="background-color: #ffffff; color: #111827; border: 3px solid ${corBorda};">
                ${textoBanner}
            </div>

            <div class="grid-2x2">
                <button class="big-btn btn-recebido" onclick="navegar('rec')">Inserir Valor Recebido</button>
                <button class="big-btn btn-gasto" onclick="navegar('desp')">Inserir Gasto</button>
            </div>
            <div class="grid-2x2">
                <button class="big-btn btn-restante" onclick="clicarBotaoResumo()">Ver Resumo</button>
                <button class="big-btn btn-contas" onclick="navegar('conta')">Contas Fixas</button>
            </div>
        </div>

        <div style="margin-top: 32px; padding-bottom: 12px;">
            <div class="month-selector">
                <button class="month-btn" onclick="mudarMes(-1)">◀ Mês Anterior</button>
                <span class="month-title">${nomeMesFormatado}</span>
                <button class="month-btn" onclick="mudarMes(1)" ${isMesAtualOuFuturoSelecao ? 'disabled' : ''}>Próximo ▶</button>
            </div>
        </div>

        <button class="fab-settings" onclick="abrirMenuOpcoes()" title="Opções e Configurações">⚙️</button>
        <input type="file" id="input-csv-file" accept=".csv" style="display:none;" onchange="processarArquivoCsv(event)">
        <input type="file" id="input-json-file" accept=".json" style="display:none;" onchange="processarRestauracaoJson(event)">
    `;
    return div;
}

function clicarBotaoResumo() {
    const [ano, mes] = state.selectedYearMonth.split('-').map(Number);
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth() + 1;

    const isMesAtual = (ano === anoAtual && mes === mesAtual);

    if (isMesAtual) {
        navegar('period');
    } else {
        state.summaryType = 'mes';
        state.gastoDetalhesAberto = false;
        navegar('summary');
    }
}

function mudarMes(delta) {
    let [ano, mes] = state.selectedYearMonth.split('-').map(Number);
    mes += delta;
    if (mes > 12) { mes = 1; ano++; }
    if (mes < 1) { mes = 12; ano--; }
    
    const novoMesStr = `${ano}-${String(mes).padStart(2, '0')}`;
    const hoje = new Date();
    const atualYearMonth = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    if (novoMesStr > atualYearMonth) return;

    state.selectedYearMonth = novoMesStr;
    render();
}

function navegar(tela) { state.currentScreen = tela; render(); }

function renderFormReceita() {
    const div = document.createElement('div');
    let htmlReceitas = '';
    const passado = isMesPassado(state.selectedYearMonth);
    const recebidasMes = state.data.receitas.filter(r => r.dataIso && r.dataIso.startsWith(state.selectedYearMonth));

    recebidasMes.forEach(r => {
        const botaoExcluir = passado ? '' : `<button class="btn-danger" style="width: auto; padding: 10px 14px; font-size: 15px; height: auto;" onclick="excluirReceita('${r.id}')">Excluir</button>`;
        htmlReceitas += `
            <div class="list-item">
                <div style="flex-grow: 1; text-align: left;">
                    <strong>${r.descricao}</strong><br><small style="color: #475569; font-weight: bold;">Data: ${r.dataIso.split('-').reverse().join('/')}</small><br>
                    <span style="color: #065f46; font-size: 20px; font-weight: 800;">${fmtMoeda(r.valor)}</span>
                </div>
                ${botaoExcluir}
            </div>
        `;
    });

    const formOuAviso = passado ? `
        <div class="badge-visualizacao">🔒 Mês passado em modo somente visualização. Não é possível adicionar novos recebimentos.</div>
    ` : `
        <label>De onde veio esse dinheiro?</label>
        <input type="text" id="desc-rec" placeholder="Ex: Salário, Aposentadoria...">
        <label>Valor recebido (R$)</label>
        <input type="number" step="0.01" id="val-rec" placeholder="0,00">
        <label>Data que recebeu</label>
        <input type="date" id="data-rec" max="${hojeIso()}" value="${hojeIso()}" onchange="validarDataInput(this)">
        
        <div class="form-actions">
            <button class="fab-back" onclick="navegar('home')">← Voltar</button>
            <button class="btn-salvar-direito" onclick="salvarReceita()">Salvar</button>
        </div>
    `;

    const botaoVoltarAbaixo = passado ? `<div style="margin-top: 20px;"><button class="fab-back" onclick="navegar('home')">← Voltar</button></div>` : '';

    div.innerHTML = `
        <div>
            ${renderHeaderMesFixo()}
            ${formOuAviso}
            ${passado ? botaoVoltarAbaixo : ''}

            <hr style="margin: 24px 0; border:none; border-top:2px solid #334155;">
            <h3 style="margin-bottom: 14px; text-align: left; font-size: 20px; color: #ffffff;">Dinheiro recebido neste mês:</h3>
            <div style="max-height: 35vh; overflow-y: auto;">
                ${htmlReceitas || '<p style="color:#94a3b8; font-size: 17px; font-weight: bold; text-align: left;">Nenhum recebimento cadastrado neste mês.</p>'}
            </div>
        </div>
        <div></div>
    `;
    return div;
}

function validarDataInput(input) {
    if (input.value > hojeIso()) {
        alert('Não é permitido selecionar uma data no futuro!');
        input.value = hojeIso();
    }
}

function salvarReceita() {
    if (isMesPassado(state.selectedYearMonth)) { alert('Não é permitido alterar meses passados.'); return; }
    const desc = document.getElementById('desc-rec').value.trim();
    const val = parseFloat(document.getElementById('val-rec').value.replace(',', '.'));
    const data = document.getElementById('data-rec').value;
    
    if (!desc || isNaN(val) || val <= 0 || !data) { alert('Preencha todos os campos corretamente!'); return; }
    if (data > hojeIso()) { alert('Não é permitido registrar recebimentos com data no futuro!'); return; }

    state.data.receitas.push({ id: crypto.randomUUID(), descricao: desc, valor: val, dataIso: data });
    saveData();
    state.currentScreen = 'success';
    state.successMessage = 'recebimento';
    state.successArticle = 'o';
    state.successReturnScreen = 'rec';
    render();
}

function excluirReceita(id) {
    if (isMesPassado(state.selectedYearMonth)) return;
    if (confirm('Deseja realmente excluir este recebimento?')) {
        state.data.receitas = state.data.receitas.filter(r => r.id !== id);
        saveData();
        render();
    }
}

function renderFormDespesa() {
    const div = document.createElement('div');
    let htmlDespesas = '';
    const passado = isMesPassado(state.selectedYearMonth);
    const despesasMes = state.data.despesas.filter(d => !d.contaFixaId && d.dataIso && d.dataIso.startsWith(state.selectedYearMonth));

    despesasMes.forEach(d => {
        const formaPgtoTxt = d.formaPagamento ? ` • ${d.formaPagamento}` : '';
        const botaoExcluir = passado ? '' : `<button class="btn-danger" style="width: auto; padding: 10px 14px; font-size: 15px; height: auto;" onclick="excluirDespesa('${d.id}')">Excluir</button>`;
        htmlDespesas += `
            <div class="list-item">
                <div style="flex-grow: 1; text-align: left;">
                    <strong>${d.descricao}</strong><br><small style="color: #475569; font-weight: bold;">Data: ${d.dataIso.split('-').reverse().join('/')}${formaPgtoTxt}</small><br>
                    <span style="color: #991b1b; font-size: 20px; font-weight: 800;">${fmtMoeda(d.valor)}</span>
                </div>
                ${botaoExcluir}
            </div>
        `;
    });

    const formOuAviso = passado ? `
        <div class="badge-visualizacao">🔒 Mês passado em modo somente visualização. Não é possível adicionar novos gastos.</div>
    ` : `
        <label>Quanto você gastou? (R$)</label>
        <input type="number" step="0.01" id="val-desp" placeholder="0,00">
        <label>Com o quê você gastou?</label>
        <input type="text" id="desc-desp" placeholder="Ex: Mercado, Farmácia...">
        <label>Como você pagou?</label>
        <select id="forma-pagamento-desp">
            <option value="Cartão de Crédito">Cartão de Crédito</option>
            <option value="Cartão de Débito">Cartão de Débito</option>
            <option value="Pix">Pix</option>
            <option value="Dinheiro">Dinheiro</option>
        </select>
        <label>Data do gasto</label>
        <input type="date" id="data-desp" max="${hojeIso()}" value="${hojeIso()}" onchange="validarDataInput(this)">
        
        <div class="form-actions">
            <button class="fab-back" onclick="navegar('home')">← Voltar</button>
            <button class="btn-salvar-direito" onclick="salvarDespesa()">Salvar</button>
        </div>
    `;

    const botaoVoltarAbaixo = passado ? `<div style="margin-top: 20px;"><button class="fab-back" onclick="navegar('home')">← Voltar</button></div>` : '';

    div.innerHTML = `
        <div>
            ${renderHeaderMesFixo()}
            ${formOuAviso}
            ${passado ? botaoVoltarAbaixo : ''}

            <hr style="margin: 24px 0; border:none; border-top:2px solid #334155;">
            <h3 style="margin-bottom: 14px; text-align: left; font-size: 20px; color: #ffffff;">Gastos deste mês:</h3>
            <div style="max-height: 28vh; overflow-y: auto;">
                ${htmlDespesas || '<p style="color:#94a3b8; font-size: 17px; font-weight: bold; text-align: left;">Nenhum gasto cadastrado neste mês.</p>'}
            </div>
        </div>
        <div></div>
    `;
    return div;
}

function salvarDespesa() {
    if (isMesPassado(state.selectedYearMonth)) { alert('Não é permitido alterar meses passados.'); return; }
    const val = parseFloat(document.getElementById('val-desp').value.replace(',', '.'));
    const desc = document.getElementById('desc-desp').value.trim();
    const formaPagamento = document.getElementById('forma-pagamento-desp').value;
    const data = document.getElementById('data-desp').value;
    
    if (!desc || isNaN(val) || val <= 0 || !data) { alert('Preencha todos os campos corretamente!'); return; }
    if (data > hojeIso()) { alert('Não é permitido registrar gastos com data no futuro!'); return; }

    state.data.despesas.push({ 
        id: crypto.randomUUID(), 
        descricao: desc, 
        valor: val, 
        dataIso: data,
        formaPagamento: formaPagamento 
    });
    saveData();
    state.currentScreen = 'success';
    state.successMessage = 'gasto';
    state.successArticle = 'o';
    state.successReturnScreen = 'desp';
    render();
}

function excluirDespesa(id) {
    if (isMesPassado(state.selectedYearMonth)) return;
    if (confirm('Deseja realmente excluir este gasto?')) {
        state.data.despesas = state.data.despesas.filter(d => d.id !== id);
        saveData();
        render();
    }
}

function renderFormContaFixa() {
    const div = document.createElement('div');
    let htmlContas = '';
    const passado = isMesPassado(state.selectedYearMonth);
    const contasAtivas = state.data.contasFixas.filter(c => {
        const inicioOk = c.mesInicioIso <= state.selectedYearMonth;
        const fimOk = !c.mesFimIso || c.mesFimIso >= state.selectedYearMonth;
        return inicioOk && fimOk;
    });

    contasAtivas.forEach(c => {
        const pagamentoInfo = state.data.pagamentosContas[`${c.id}_${state.selectedYearMonth}`];
        const estaPaga = pagamentoInfo !== undefined;
        
        let infoSub = `Vencimento dia ${c.diaVencimento}`;
        if (estaPaga && pagamentoInfo.dataIso) {
            const [anoP, mesP, diaP] = pagamentoInfo.dataIso.split('-');
            infoSub = `Vencimento dia ${c.diaVencimento} • Pago em ${diaP}/${mesP}/${anoP}`;
        }

        const statusHtml = estaPaga 
            ? `<span style="color: #065f46; font-weight: 800;">🟢 Conta Paga</span> - <span style="color: #111827; font-weight:800;">${fmtMoeda(pagamentoInfo.valor)}</span>`
            : `<span style="color: #991b1b; font-weight: 800;">🔴 Pendente</span> - <span style="color: #111827; font-weight:800;">${fmtMoeda(c.valorMedio)}</span>`;

        let botoesAcao = '';
        if (!passado) {
            botoesAcao = estaPaga 
                ? `<button class="btn-secondary" style="width: auto; padding: 8px 12px; font-size: 15px; height: auto; border-color:#047857; color:#047857;" onclick="pedirBaixaConta('${c.id}')">Alterar Valor</button>`
                : `
                    <button class="btn-success-small" style="width: auto; padding: 10px 14px; font-size: 15px; height: auto;" onclick="pedirBaixaConta('${c.id}')">Paguei</button>
                    <button class="btn-danger" style="width: auto; padding: 10px 14px; font-size: 15px; height: auto;" onclick="excluirContaFixa('${c.id}')">Excluir</button>
                `;
        }

        htmlContas += `
            <div class="list-item">
                <div style="flex-grow: 1; text-align: left;">
                    <strong>${c.descricao}</strong><br><small style="color: #475569; font-weight: bold;">${infoSub}</small><br>
                    ${statusHtml}
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    ${botoesAcao}
                </div>
            </div>
        `;
    });

    const formOuAviso = passado ? `
        <div class="badge-visualizacao">🔒 Mês passado em modo somente visualização. Não é possível cadastrar novas contas fixas.</div>
    ` : `
        <label>Nome da Conta Fixa</label>
        <input type="text" id="desc-conta" placeholder="Ex: MEI, Luz, Internet...">
        <label>Valor estimado (R$)</label>
        <input type="number" step="0.01" id="val-conta" placeholder="0,00">
        <label>Dia do vencimento</label>
        <input type="number" id="dia-conta" min="1" max="31" placeholder="Ex: 10">
        
        <div class="form-actions">
            <button class="fab-back" onclick="navegar('home')">← Voltar</button>
            <button class="btn-salvar-direito" onclick="salvarContaFixa()">Salvar</button>
        </div>
    `;

    const botaoVoltarAbaixo = passado ? `<div style="margin-top: 20px;"><button class="fab-back" onclick="navegar('home')">← Voltar</button></div>` : '';

    div.innerHTML = `
        <div>
            ${renderHeaderMesFixo()}
            ${formOuAviso}
            ${passado ? botaoVoltarAbaixo : ''}

            <hr style="margin: 24px 0; border:none; border-top:2px solid #334155;">
            <h3 style="margin-bottom: 14px; text-align: left; font-size: 20px; color: #ffffff;">Contas deste mês:</h3>
            <div style="max-height: 30vh; overflow-y: auto;">
                ${htmlContas || '<p style="color:#94a3b8; font-size: 17px; font-weight: bold; text-align: left;">Nenhuma conta fixa cadastrada neste mês.</p>'}
            </div>
        </div>
        <div></div>
    `;
    return div;
}

function salvarContaFixa() {
    if (isMesPassado(state.selectedYearMonth)) { alert('Não é permitido alterar meses passados.'); return; }
    const desc = document.getElementById('desc-conta').value.trim();
    const val = parseFloat(document.getElementById('val-conta').value.replace(',', '.'));
    const diaVenc = parseInt(document.getElementById('dia-conta').value, 10);

    if (!desc || isNaN(val) || val <= 0) { alert('Preencha a descrição e o valor corretamente!'); return; }
    if (isNaN(diaVenc) || diaVenc < 1 || diaVenc > 31) { alert('O dia do vencimento deve ser um número entre 1 e 31!'); return; }

    state.data.contasFixas.push({
        id: crypto.randomUUID(),
        descricao: desc,
        valorMedio: val,
        diaVencimento: diaVenc,
        mesInicioIso: state.selectedYearMonth,
        mesFimIso: null
    });
    saveData();
    state.currentScreen = 'success';
    state.successMessage = 'conta';
    state.successArticle = 'a';
    state.successReturnScreen = 'conta';
    render();
}

function excluirContaFixa(id) {
    if (isMesPassado(state.selectedYearMonth)) return;
    const conta = state.data.contasFixas.find(c => c.id === id);
    if (!conta) return;

    if (confirm('Deseja realmente excluir esta conta fixa? Ela deixará de aparecer nas projeções deste mês e dos seguintes.')) {
        const [ano, mes] = state.selectedYearMonth.split('-').map(Number);
        const dataAnt = new Date(ano, mes - 2, 1);
        conta.mesFimIso = dataAnt.toISOString().slice(0, 7);
        delete state.data.pagamentosContas[`${id}_${state.selectedYearMonth}`];
        saveData();
        render();
    }
}

function pedirBaixaConta(id) {
    if (isMesPassado(state.selectedYearMonth)) return;
    state.activeContaParaPagar = state.data.contasFixas.find(c => c.id === id);
    state.currentScreen = 'confirm-pagamento';
    render();
}

function renderConfirmPagamento() {
    if (isMesPassado(state.selectedYearMonth)) { navegar('conta'); return; }
    const c = state.activeContaParaPagar;
    const pagamentoInfo = state.data.pagamentosContas[`${c.id}_${state.selectedYearMonth}`];
    const valorAtual = pagamentoInfo !== undefined ? pagamentoInfo.valor : c.valorMedio;
    const dataAtual = pagamentoInfo !== undefined ? pagamentoInfo.dataIso : hojeIso();
    const jaPaga = pagamentoInfo !== undefined;

    const tituloTela = jaPaga ? `Alterar valor pago: ${c.descricao}` : `Pagar conta: ${c.descricao}`;
    const inputDataHtml = jaPaga 
        ? `<input type="date" value="${dataAtual}" disabled style="background:#e2e8f0; color:#64748b; margin-bottom:20px;" />` 
        : `<input type="date" id="data-real-pago" max="${hojeIso()}" value="${dataAtual}" onchange="validarDataInput(this)">`;

    const div = document.createElement('div');
    div.innerHTML = `
        <div>
            ${renderHeaderMesFixo()}
            <h2 style="font-size: 22px; text-align: left; margin-bottom: 16px; color: #ffffff;">${tituloTela}</h2>
            <label style="margin-top:20px;">Valor real pago (R$):</label>
            <input type="number" step="0.01" id="val-real-pago" value="${valorAtual}">
            
            <label>Data do pagamento</label>
            ${inputDataHtml}
            
            <div class="form-actions">
                <button class="fab-back" onclick="navegar('conta')">← Voltar</button>
                <button class="btn-salvar-direito" onclick="confirmarPagamentoReal()">Salvar</button>
            </div>
        </div>
        <div></div>
    `;
    return div;
}

function confirmarPagamentoReal() {
    if (isMesPassado(state.selectedYearMonth)) return;
    const valReal = parseFloat(document.getElementById("val-real-pago").value.replace(',', '.'));
    const elData = document.getElementById("data-real-pago");
    const dataReal = elData ? elData.value : (state.data.pagamentosContas[`${state.activeContaParaPagar.id}_${state.selectedYearMonth}`]?.dataIso || hojeIso());
    
    if (isNaN(valReal) || valReal <= 0 || !dataReal) { alert('Preencha os campos corretamente!'); return; }
    if (elData && dataReal > hojeIso()) { alert('Não é permitido registrar pagamentos com data no futuro!'); return; }

    const c = state.activeContaParaPagar;
    state.data.pagamentosContas[`${c.id}_${state.selectedYearMonth}`] = { valor: valReal, dataIso: dataReal };
    saveData();
    state.currentScreen = 'success';
    state.successMessage = 'pagamento';
    state.successArticle = 'o';
    state.successReturnScreen = 'conta';
    render();
}

function renderChoosePeriod() {
    const div = document.createElement('div');
    div.innerHTML = `
        <div>
            ${renderHeaderMesFixo()}

            <h2 style="text-align: center; margin-top: 30px; font-size: 24px; color: #ffffff; line-height: 1.4;">Você quer ver o resumo da semana ou do mês?</h2>
            <div style="margin-top: 40px; display: flex; flex-direction: column; gap: 20px;">
                <button class="big-btn" style="height: 90px; background:#ffffff; border:3px solid #334155; color: #1e293b; border-radius: 20px; font-size: 22px;" onclick="escolherPeriodo('semana')">📅 DA SEMANA</button>
                <button class="big-btn" style="height: 90px; background:#ffffff; border:3px solid #334155; color: #1e293b; border-radius: 20px; font-size: 22px;" onclick="escolherPeriodo('mes')">📊 DO MÊS INTEIRO</button>
            </div>

            <div style="margin-top: 40px;">
                <button class="fab-back" onclick="navegar('home')">← Voltar</button>
            </div>
        </div>
        <div></div>
    `;
    return div;
}

function escolherPeriodo(tipo) {
    state.summaryType = tipo;
    state.currentScreen = 'summary';
    state.gastoDetalhesAberto = false;
    render();
}

function calcularResumo() {
    const [ano, mes] = state.selectedYearMonth.split('-').map(Number);
    const diasNoMes = new Date(ano, mes, 0).getDate();

    const recebido = arredondar(
        state.data.receitas
            .filter(r => r.dataIso && r.dataIso.startsWith(state.selectedYearMonth))
            .reduce((acc, r) => acc + (parseFloat(r.valor) || 0), 0)
    );

    const avulsas = arredondar(
        state.data.despesas
            .filter(d => d.dataIso && d.dataIso.startsWith(state.selectedYearMonth))
            .reduce((acc, d) => acc + (parseFloat(d.valor) || 0), 0)
    );

    let totalContasPagas = 0;
    let totalContasPendentes = 0;

    state.data.contasFixas.forEach(c => {
        const inicioOk = c.mesInicioIso <= state.selectedYearMonth;
        const fimOk = !c.mesFimIso || c.mesFimIso >= state.selectedYearMonth;
        if (!inicioOk || !fimOk) return;

        const pagamentoInfo = state.data.pagamentosContas[`${c.id}_${state.selectedYearMonth}`];
        if (pagamentoInfo !== undefined && pagamentoInfo.valor !== undefined) {
            totalContasPagas += parseFloat(pagamentoInfo.valor) || 0;
        } else {
            totalContasPendentes += parseFloat(c.valorMedio) || 0;
        }
    });

    totalContasPagas = arredondar(totalContasPagas);
    totalContasPendentes = arredondar(totalContasPendentes);

    const contasFixasTotal = arredondar(totalContasPagas + totalContasPendentes);
    const gastoTotalGeral = arredondar(contasFixasTotal + avulsas);
    const restanteMes = arredondar(recebido - gastoTotalGeral);

    if (state.summaryType === 'mes') {
        const valorGastoTotalComContas = arredondar(avulsas + totalContasPagas + totalContasPendentes);
        return {
            inicial: recebido,
            gastoTotal: valorGastoTotalComContas,
            contasPagas: totalContasPagas,
            contasAPagar: totalContasPendentes,
            outrosGastos: avulsas,
            restante: restanteMes
        };
    } else {
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth() + 1;
        
        let diasRestantesNoMes = diasNoMes;
        if (ano === anoAtual && mes === mesAtual) {
            const diaHoje = hoje.getDate();
            diasRestantesNoMes = Math.max(1, (diasNoMes - diaHoje) + 1);
        }

        const dFim = (ano === anoAtual && mes === mesAtual) ? new Date(hoje) : new Date(ano, mes - 1, diasNoMes);
        const diaSemanaHoje = dFim.getDay();
        const diasAteDomingo = diaSemanaHoje === 0 ? 1 : (7 - diaSemanaHoje + 1);
        const diasProjecaoSemana = Math.min(diasAteDomingo, diasRestantesNoMes);
        
        const dInicioSemana = new Date(dFim);
        dInicioSemana.setDate(dFim.getDate() - (diaSemanaHoje === 0 ? 6 : diaSemanaHoje - 1));
        const inicioStr = dInicioSemana.toISOString().slice(0, 10);
        const fimStr = dFim.toISOString().slice(0, 10);

        const gastoSemanaAtual = arredondar(
            state.data.despesas
                .filter(d => !d.contaFixaId && d.dataIso && d.dataIso >= inicioStr && d.dataIso <= fimStr)
                .reduce((acc, d) => acc + (parseFloat(d.valor) || 0), 0)
        );

        const baseCalculo = Math.max(0, recebido - contasFixasTotal);
        const valorInicialSemana = arredondar((baseCalculo / diasRestantesNoMes) * diasProjecaoSemana);
        const valorDisponivelSemana = arredondar(valorInicialSemana - gastoSemanaAtual);

        return {
            inicial: isNaN(valorInicialSemana) ? 0 : valorInicialSemana,
            gastoTotal: isNaN(gastoSemanaAtual) ? 0 : gastoSemanaAtual,
            contasPagas: 0,
            contasAPagar: 0,
            outrosGastos: isNaN(gastoSemanaAtual) ? 0 : gastoSemanaAtual,
            restante: isNaN(valorDisponivelSemana) ? 0 : valorDisponivelSemana
        };
    }
}

function toggleGastoDetalhes() {
    if (state.summaryType === 'mes') {
        state.gastoDetalhesAberto = !state.gastoDetalhesAberto;
        render();
    }
}

function renderSummary() {
    const res = calcularResumo();
    const div = document.createElement('div');
    
    let htmlDetalhesGasto = '';
    if (state.summaryType === 'mes' && state.gastoDetalhesAberto) {
        htmlDetalhesGasto = `
            <div style="margin-top: 12px; padding-left: 12px; border-left: 4px solid #f87171; display: flex; flex-direction: column; gap: 8px; text-align: left;">
                <div style="display: flex; justify-content: space-between; font-size: 16px; color: #475569; font-weight: bold;">
                    <span>• Contas já pagas:</span>
                    <strong style="color: #065f46;">${fmtMoeda(res.contasPagas)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 16px; color: #475569; font-weight: bold;">
                    <span>• Contas a pagar:</span>
                    <strong style="color: #c2410c;">${fmtMoeda(res.contasAPagar)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 16px; color: #475569; font-weight: bold;">
                    <span>• Outros Gastos:</span>
                    <strong style="color: #991b1b;">${fmtMoeda(res.outrosGastos)}</strong>
                </div>
            </div>
        `;
    }

    const cursorGasto = state.summaryType === 'mes' ? 'cursor: pointer;' : '';
    const dicaClique = state.summaryType === 'mes' ? `<div style="font-size: 14px; font-weight: bold; color: #047857; margin-top: 6px;">👉 (Toque para ${state.gastoDetalhesAberto ? 'recolher' : 'ver os detalhes'})</div>` : '';

    const [ano, mes] = state.selectedYearMonth.split('-').map(Number);
    const hoje = new Date();
    const isMesAtual = (ano === hoje.getFullYear() && mes === hoje.getMonth() + 1);
    const acaoVoltar = isMesAtual ? "navegar('period')" : "navegar('home')";

    div.innerHTML = `
        <div>
            ${renderHeaderMesFixo()}

            <div class="summary-box">
                <div class="summary-title" style="color: #334155;">${state.summaryType === 'semana' ? '⭐ Disponível até domingo' : '⭐ Valor Restante'}</div>
                <div class="summary-value" style="color: ${res.restante < 0 ? '#991b1b' : '#1e293b'};">${fmtMoeda(res.restante)}</div>
            </div>

            <div class="summary-box" style="${cursorGasto}" onclick="toggleGastoDetalhes()">
                <div class="summary-title">
                    ${state.summaryType === 'semana' ? '📤 Valor Gasto (nesta semana)' : '📤 Valor Gasto Total'}
                    ${dicaClique}
                </div>
                <div class="summary-value" style="color: #991b1b; font-weight: bold;">${fmtMoeda(res.gastoTotal)}</div>
                ${htmlDetalhesGasto}
            </div>

            <div class="summary-box">
                <div class="summary-title">💵 Valor Inicial (Recebido)</div>
                <div class="summary-value" style="color: #1e293b; font-weight: bold;">${fmtMoeda(res.inicial)}</div>
            </div>

            <div style="margin-top: 24px; display: flex; justify-content: space-between; align-items: center;">
                <button class="fab-back" onclick="${acaoVoltar}">← Voltar</button>
            </div>
        </div>
        <div></div>
    `;
    return div;
}

function renderSuccess() {
    const div = document.createElement('div');
    const artigo = state.successArticle || 'o';
    const textoSucesso = artigo === 'a' ? `Sua ${state.successMessage} foi salva com sucesso!` : `Seu ${state.successMessage} foi salvo com sucesso!`;

    div.innerHTML = `
        <div style="display: flex; flex-direction: column; justify-content: space-between; min-height: 88vh;">
            <div style="flex-grow:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
                <div style="width: 130px; height: 130px; border: 4px solid #047857; background: #dcfce7; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 70px; color: #047857; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(4,120,87,0.3);">✓</div>
                <h2 style="font-size: 26px; color: #ffffff; font-weight: bold;">${textoSucesso}</h2>
            </div>
            <div style="margin-top: 20px;">
                <button class="fab-back" onclick="navegar(state.successReturnScreen)">← Voltar</button>
            </div>
        </div>
    `;
    return div;
}

function obterItensCronologicos() {
    let itens = [];
    state.data.receitas.filter(r => r.dataIso && r.dataIso.startsWith(state.selectedYearMonth)).forEach(r => {
        itens.push({ data: r.dataIso, tipo: 'Recebido', desc: r.descricao, valor: parseFloat(r.valor) || 0 });
    });
    state.data.despesas.filter(d => d.dataIso && d.dataIso.startsWith(state.selectedYearMonth)).forEach(d => {
        itens.push({ data: d.dataIso, tipo: 'Gasto', desc: d.descricao, valor: parseFloat(d.valor) || 0 });
    });
    state.data.contasFixas.forEach(c => {
        const inicioOk = c.mesInicioIso <= state.selectedYearMonth;
        const fimOk = !c.mesFimIso || c.mesFimIso >= state.selectedYearMonth;
        if (inicioOk && fimOk) {
            const pagamentoInfo = state.data.pagamentosContas[`${c.id}_${state.selectedYearMonth}`];
            const valorEfetivo = (pagamentoInfo !== undefined && pagamentoInfo.valor !== undefined) ? pagamentoInfo.valor : c.valorMedio;
            
            let dataItem = `${state.selectedYearMonth}-${String(Math.min(c.diaVencimento, new Date(state.selectedYearMonth.split('-')[0], state.selectedYearMonth.split('-')[1], 0).getDate())).padStart(2,'0')}`;
            if (pagamentoInfo !== undefined && pagamentoInfo.dataIso) {
                dataItem = pagamentoInfo.dataIso;
            }

            itens.push({ data: dataItem, tipo: 'Conta Fixa', desc: c.descricao, valor: parseFloat(valorEfetivo) || 0 });
        }
    });
    return itens.sort((a,b) => a.data.localeCompare(b.data));
}

function abrirMenuOpcoes() {
    const modal = document.createElement('div');
    modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; padding:20px; z-index:1000;";
    modal.innerHTML = `
        <div class="card" style="width:100%; max-width:400px; background:#ffffff; display:flex; flex-direction:column; gap:14px;">
            <h3 style="font-size: 22px; color: #111827; font-weight: bold;">⚙️ Opções e Dados</h3>
            <p style="color:#475569; font-size:16px; margin-bottom:4px; text-align: left; font-weight: bold;">Escolha o que deseja fazer:</p>
            
            <button class="btn-primary" style="margin-top:0; font-size: 18px;" onclick="this.parentElement.parentElement.remove(); baixarBackupManualJson();">💾 Baixar Backup Atual</button>
            <button class="btn-secondary" style="margin-top:0; border-color: #047857; color: #047857; font-size: 18px;" onclick="this.parentElement.parentElement.remove(); abrirOpcoesExportacao();">📤 Compartilhar Resumo</button>
            <button class="btn-secondary" style="margin-top:0; border-color: #047857; color: #047857; font-size: 18px;" onclick="this.parentElement.parentElement.remove(); acionarImportacaoCsv();">📥 Importar Dados (CSV)</button>
            <button class="btn-secondary" style="margin-top:0; border-color: #1d4ed8; color: #1d4ed8; font-size: 18px;" onclick="this.parentElement.parentElement.remove(); acionarRestauracaoJson();">🔄 Restaurar Backup</button>
            
            <button class="fab-back" style="width:100%; margin-top:8px; justify-content:center;" onclick="this.parentElement.parentElement.remove()">Fechar</button>
        </div>
    `;
    document.body.appendChild(modal);
}

function abrirOpcoesExportacao() {
    const modal = document.createElement('div');
    modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; padding:20px; z-index:1000;";
    modal.innerHTML = `
        <div class="card" style="width:100%; max-width:400px; background:#ffffff;">
            <h3 style="font-size: 22px; color: #111827; font-weight: bold;">📤 Como deseja exportar?</h3>
            <p style="margin: 12px 0; color:#475569; font-size:16px; text-align: left; font-weight: bold;">Escolha o formato:</p>
            <button class="btn-primary" style="font-size: 18px;" onclick="exportarTextoWhatsApp(); document.body.lastChild.remove();">Mensagem para WhatsApp</button>
            <button class="btn-secondary" style="font-size: 18px;" onclick="exportarExcelCsv(); document.body.lastChild.remove();">Planilha Excel (.CSV)</button>
            <button class="fab-back" style="width:100%; margin-top:14px; justify-content:center; text-align:center;" onclick="this.parentElement.parentElement.remove()">Cancelar</button>
        </div>
    `;
    document.body.appendChild(modal);
}

function exportarTextoWhatsApp() {
    const prevType = state.summaryType;
    state.summaryType = 'mes';
    const res = calcularResumo();
    state.summaryType = prevType;

    const nomeMesFormatado = formatarNomeMes(state.selectedYearMonth);
    const itens = obterItensCronologicos();
    let txt = `📊 *RESUMO DE GASTOS - ${nomeMesFormatado}*\n`;
    txt += `• Valor Inicial: ${fmtMoeda(res.inicial)}\n`;
    txt += `• Valor Gasto (Total): ${fmtMoeda(res.gastoTotal)}\n`;
    txt += `  - Contas já pagas: ${fmtMoeda(res.contasPagas)}\n`;
    txt += `  - Contas a pagar: ${fmtMoeda(res.contasAPagar)}\n`;
    txt += `  - Outros Gastos: ${fmtMoeda(res.outrosGastos)}\n`;
    txt += `• *Valor Restante: ${fmtMoeda(res.restante)}*\n\n`;
    txt += `📅 *EXTRATO CRONOLÓGICO:*\n`;

    if (itens.length === 0) txt += `Nenhum lançamento neste mês.\n`;
    itens.forEach(i => {
        const [ano, mes, dia] = i.data.split('-');
        const dataFmt = `${dia}/${mes}/${ano}`;
        const sinal = i.tipo === 'Recebido' ? '+' : '-';
        txt += `${dataFmt} | ${i.tipo}: ${i.desc} (${sinal}${fmtMoeda(i.valor)})\n`;
    });

    if (navigator.share) {
        navigator.share({ title: 'Resumo de Gastos', text: txt }).catch(() => {});
    } else {
        navigator.clipboard.writeText(txt);
        alert('Resumo copiado para a área de transferência!');
    }
}

function exportarExcelCsv() {
    const itens = obterItensCronologicos();
    let csv = "\uFEFFData;Tipo;Descricao;Valor (R$)\n";
    itens.forEach(i => {
        const [ano, mes, dia] = i.data.split('-');
        const dataFmt = `${dia}/${mes}/${ano}`;
        const sinal = i.tipo === 'Recebido' ? '' : '-';
        const valStr = i.valor.toFixed(2).replace('.', ',');
        csv += `${dataFmt};${i.tipo};${i.desc};${sinal}${valStr}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const file = new File([blob], `Gastos_${state.selectedYearMonth}.csv`, { type: 'text/csv' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: `Gastos_${state.selectedYearMonth}.csv` }).catch(() => {});
    } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Gastos_${state.selectedYearMonth}.csv`;
        a.click();
    }
}

function acionarImportacaoCsv() { document.getElementById('input-csv-file').click(); }

function processarArquivoCsv(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const conteudo = e.target.result;
            const linhas = conteudo.split(/\r\n|\n/);
            let importadosCount = 0;

            for (let i = 1; i < linhas.length; i++) {
                const linha = linhas[i].trim();
                if (!linha) continue;

                const colunas = linha.split(';');
                if (colunas.length < 4) continue;

                const dataBr = colunas[0].trim();
                const tipo = colunas[1].trim();
                const descricao = colunas[2].trim();
                let valorStr = colunas[3].trim();

                const partesData = dataBr.split('/');
                if (partesData.length !== 3) continue;
                const dataIso = `${partesData[2]}-${partesData[1]}-${partesData[0]}`;

                valorStr = valorStr.replace('R$', '').replace(/\s/g, '').replace('.', '').replace(',', '.');
                const valor = Math.abs(parseFloat(valorStr));

                if (isNaN(valor) || valor <= 0) continue;

                if (tipo.toLowerCase().includes('recebido')) {
                    state.data.receitas.push({ id: crypto.randomUUID(), descricao: descricao, valor: valor, dataIso: dataIso });
                    importadosCount++;
                } else if (tipo.toLowerCase().includes('gasto')) {
                    state.data.despesas.push({ id: crypto.randomUUID(), descricao: descricao, valor: valor, dataIso: dataIso, formaPagamento: 'Outros' });
                    importadosCount++;
                }
            }

            saveData();
            alert(`Sucesso! Foram importados ${importadosCount} registros do arquivo CSV.`);
            render();
        } catch (err) {
            alert('Erro ao processar o arquivo CSV. Verifique se o formato está correto.');
        }
        event.target.value = '';
    };
    reader.readAsText(file, 'UTF-8');
}

function acionarRestauracaoJson() { document.getElementById('input-json-file').click(); }

function processarRestauracaoJson(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const conteudo = e.target.result;
            const dadosRestaurados = JSON.parse(conteudo);

            if (dadosRestaurados && (dadosRestaurados.receitas || dadosRestaurados.despesas || dadosRestaurados.contasFixas)) {
                state.data = dadosRestaurados;
                saveData();
                alert('Backup restaurado com sucesso! Todos os dados foram recuperados.');
                render();
            } else {
                alert('O arquivo selecionado não parece ser um backup válido.');
            }
        } catch (err) {
            alert('Erro ao ler o arquivo JSON de backup.');
        }
        event.target.value = ``;
    };
    reader.readAsText(file, 'UTF-8');
}

function verificarContasVencendoHoje() {
    const hojeIsoStr = hojeIso();
    const [ano, mes, diaHoje] = hojeIsoStr.split('-').map(Number);
    const mesAtual = hojeIsoStr.slice(0,7);
    
    state.data.contasFixas.forEach(c => {
        const pago = state.data.pagamentosContas[`${c.id}_${mesAtual}`] !== undefined;
        if (pago) return;

        const inicioOk = c.mesInicioIso <= mesAtual;
        const fimOk = !c.mesFimIso || c.mesFimIso >= mesAtual;
        if (!inicioOk || !fimOk) return;

        const diaValido = Math.min(c.diaVencimento, new Date(ano, mes, 0).getDate());
        if (diaValido === diaHoje) {
            setTimeout(() => {
                const el = document.getElementById('aviso-vencimento-hoje');
                if(el) {
                    el.style.display = 'block';
                    el.innerHTML = `⚠️ <strong>Conta vencendo hoje:</strong> ${c.descricao}. <a href="#" onclick="pedirBaixaConta('${c.id}'); return false;" style="color: #1e3a8a; text-decoration: underline;">Dar baixa agora</a>`;
                }
            }, 100);
        }
    });
}

render();
