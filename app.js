/**
 * =====================================================================
 *  FRONTEND — SISTEMA DE AGENDAMENTO DA CLÍNICA
 *  Lógica de Interface & Integração com Google Sheets (GAS)
 * =====================================================================
 */

// INSIRA AQUI A URL DE IMPLANTAÇÃO GERADA NO GOOGLE APPS SCRIPT
const API_URL = 'https://script.google.com/macros/s/AKfycbx-DANu63ie1JlUmH-Kd9fkubyOF1VNDLml79vrFWeiDMJcbW40dOW0ZPmsuwbJwJTpaQ/exechttps://script.google.com/macros/s/AKfycbx-DANu63ie1JlUmH-Kd9fkubyOF1VNDLml79vrFWeiDMJcbW40dOW0ZPmsuwbJwJTpaQ/exec';

// MOCK DATA (Utilizado se a API_URL não estiver configurada ou falhar)
const MOCK_SERVICES = [
    { id: "1", nome: "Consulta Geral", duracaoMin: 30, preco: 150.00 },
    { id: "2", nome: "Limpeza Dentária", duracaoMin: 45, preco: 200.00 },
    { id: "3", nome: "Canal e Restauração", duracaoMin: 60, preco: 350.00 },
    { id: "4", nome: "Clareamento Dental", duracaoMin: 60, preco: 500.00 }
];

const MOCK_TIMES = ["08:00", "08:45", "09:30", "10:15", "11:00", "13:30", "14:15", "15:00", "15:45", "16:30"];

// ESTADO GLOBAL DO APP
const AppState = {
    currentStep: 1,
    services: [],
    selectedService: null,
    selectedDate: '',
    selectedTime: '',
    clientName: '',
    clientWhatsapp: '',
    bookingResult: null,
    adminToken: '',
    useMock: true // Mudará para falso se API_URL estiver definida e responder
};

// ELEMENTOS DOM
const DOM = {
    // Passos
    steps: document.querySelectorAll('.step'),
    stepContents: document.querySelectorAll('.step-content'),
    progressBar: document.getElementById('progress-bar'),

    // Passo 1 (Serviços)
    servicesGrid: document.getElementById('services-grid'),
    servicesLoading: document.getElementById('services-loading'),
    servicesError: document.getElementById('services-error'),
    btnRetryServices: document.getElementById('btn-retry-services'),

    // Passo 2 (Data e Hora)
    selectedServiceBanner: document.getElementById('selected-service-banner'),
    inputDate: document.getElementById('input-date'),
    timesGrid: document.getElementById('times-grid'),
    timesLoading: document.getElementById('times-loading'),
    timesPlaceholder: document.getElementById('times-placeholder'),
    timesError: document.getElementById('times-error'),
    timesEmpty: document.getElementById('times-empty'),
    btnBackTo1: document.getElementById('btn-back-to-1'),
    btnNextTo3: document.getElementById('btn-next-to-3'),

    // Passo 3 (Identificação)
    appointmentSummary: document.getElementById('appointment-summary'),
    formClient: document.getElementById('form-client'),
    clientNameInput: document.getElementById('client-name'),
    clientWhatsappInput: document.getElementById('client-whatsapp'),
    bookingLoading: document.getElementById('booking-loading'),
    btnBackTo2: document.getElementById('btn-back-to-2'),
    btnSubmitBooking: document.getElementById('btn-submit-booking'),

    // Passo 4 (Sucesso)
    successDetails: document.getElementById('success-details'),
    btnResetBooking: document.getElementById('btn-reset-booking'),

    // Admin Panel
    btnAdminToggle: document.getElementById('btn-admin-toggle'),
    adminPanel: document.getElementById('admin-panel'),
    adminClose: document.getElementById('btn-admin-close'),
    adminAuthSection: document.getElementById('admin-auth-section'),
    adminContentSection: document.getElementById('admin-content-section'),
    adminTokenInput: document.getElementById('admin-token'),
    btnAdminLogin: document.getElementById('btn-admin-login'),
    adminDateInput: document.getElementById('admin-date'),
    btnAdminRefresh: document.getElementById('btn-admin-refresh'),
    adminLoading: document.getElementById('admin-loading'),
    adminTbody: document.getElementById('admin-tbody'),
    adminEmpty: document.getElementById('admin-empty'),
    schedulingApp: document.getElementById('scheduling-app')
};

// =====================================================================
// INICIALIZAÇÃO
// =====================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Configura o uso ou não da API real
    AppState.useMock = (API_URL === '');

    // Configurar limites de data
    setupDateLimits();

    // Carregar Serviços
    loadServices();

    // Registrar Event Listeners
    registerEvents();
});

// Configura o input do calendário para datas válidas (hoje até D+60)
function setupDateLimits() {
    const hoje = new Date();
    const amanha = new Date();
    amanha.setDate(hoje.getDate() + 1); // Pode agendar a partir de amanhã

    const maxData = new Date();
    maxData.setDate(hoje.getDate() + 60); // Limite de 60 dias de antecedência

    const formatStr = (d) => d.toISOString().split('T')[0];

    DOM.inputDate.min = formatStr(amanha);
    DOM.inputDate.max = formatStr(maxData);

    // Configura data padrão no admin
    DOM.adminDateInput.value = formatStr(hoje);
}

// =====================================================================
// REGISTRO DE EVENTOS
// =====================================================================
function registerEvents() {
    // Retentativas
    DOM.btnRetryServices.addEventListener('click', loadServices);

    // Mudança de Data no Passo 2
    DOM.inputDate.addEventListener('change', (e) => {
        AppState.selectedDate = e.target.value;
        AppState.selectedTime = '';
        DOM.btnNextTo3.disabled = true;
        if (AppState.selectedDate) {
            loadTimeSlots();
        } else {
            showTimeState('placeholder');
        }
    });

    // Navegação de Passos
    DOM.btnBackTo1.addEventListener('click', () => goToStep(1));
    DOM.btnNextTo3.addEventListener('click', () => {
        renderSummary();
        goToStep(3);
    });
    DOM.btnBackTo2.addEventListener('click', () => goToStep(2));

    // Formulário de Agendamento
    DOM.formClient.addEventListener('submit', handleFormSubmit);

    // Reiniciar agendamento
    DOM.btnResetBooking.addEventListener('click', resetBookingFlow);

    // Toggle Painel Admin
    DOM.btnAdminToggle.addEventListener('click', () => {
        DOM.schedulingApp.classList.add('hidden');
        DOM.adminPanel.classList.remove('hidden');
    });
    DOM.adminClose.addEventListener('click', () => {
        DOM.adminPanel.classList.add('hidden');
        DOM.schedulingApp.classList.remove('hidden');
    });

    // Login Admin
    DOM.btnAdminLogin.addEventListener('click', handleAdminLogin);
    DOM.btnAdminRefresh.addEventListener('click', loadAdminAppointments);
    DOM.adminDateInput.addEventListener('change', loadAdminAppointments);
}

// =====================================================================
// CONTROLE DE NAVEGAÇÃO / PASSOS
// =====================================================================
function goToStep(stepNum) {
    AppState.currentStep = stepNum;

    // Atualiza classes do container de progresso
    DOM.steps.forEach(step => {
        const num = parseInt(step.dataset.step);
        if (num === stepNum) {
            step.className = 'step active';
        } else if (num < stepNum) {
            step.className = 'step completed';
        } else {
            step.className = 'step';
        }
    });

    // Atualiza a barra de progresso (0% a 100%)
    let pct = 0;
    if (stepNum === 2) pct = 50;
    if (stepNum === 3) pct = 100;
    DOM.progressBar.style.setProperty('--progress', `${pct}%`);

    // Mostra/Esconde conteúdo
    DOM.stepContents.forEach(content => {
        content.classList.remove('active');
    });

    if (stepNum === 4) {
        document.getElementById('step-success').classList.add('active');
        // Esconde barra de progresso no sucesso
        document.querySelector('.progress-container').classList.add('hidden');
    } else {
        document.getElementById(`step-${stepNum}`).classList.add('active');
        document.querySelector('.progress-container').classList.remove('hidden');
    }
}

// =====================================================================
// CARREGAMENTO E RENDERIZAÇÃO DOS SERVIÇOS
// =====================================================================
async function loadServices() {
    DOM.servicesLoading.classList.remove('hidden');
    DOM.servicesError.classList.add('hidden');
    DOM.servicesGrid.innerHTML = '';

    if (AppState.useMock) {
        // Simular lag de rede
        setTimeout(() => {
            AppState.services = MOCK_SERVICES;
            renderServices(MOCK_SERVICES);
        }, 800);
        return;
    }

    try {
        const response = await fetch(`${API_URL}?action=servicos`);
        if (!response.ok) throw new Error('Falha no HTTP');
        const data = await response.json();

        if (data.success) {
            AppState.services = data.servicos;
            renderServices(data.servicos);
        } else {
            throw new Error(data.error || 'Erro ao carregar dados do GAS');
        }
    } catch (err) {
        console.warn('Conexão com GAS falhou, revertendo para mock local...', err);
        AppState.useMock = true;
        // Carrega mock local
        AppState.services = MOCK_SERVICES;
        renderServices(MOCK_SERVICES);
    }
}

function renderServices(services) {
    DOM.servicesLoading.classList.add('hidden');

    if (services.length === 0) {
        DOM.servicesGrid.innerHTML = `<p class="text-center" style="grid-column: 1/-1;">Nenhum serviço ativo encontrado.</p>`;
        return;
    }

    services.forEach(serv => {
        const card = document.createElement('div');
        card.className = 'service-card';
        card.dataset.id = serv.id;

        card.innerHTML = `
            <h3 class="service-name">${serv.nome}</h3>
            <div class="service-duration">
                <i class="fa-regular fa-clock"></i> ${serv.duracaoMin} min
            </div>
            <div class="service-price">
                R$ ${Number(serv.preco).toFixed(2).replace('.', ',')}
            </div>
        `;

        card.addEventListener('click', () => selectService(serv));
        DOM.servicesGrid.appendChild(card);
    });
}

function selectService(service) {
    AppState.selectedService = service;

    // Atualiza estilização no grid
    document.querySelectorAll('.service-card').forEach(card => {
        if (card.dataset.id === String(service.id)) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });

    // Atualiza banner de info do serviço no Passo 2
    DOM.selectedServiceBanner.innerHTML = `
        <span><i class="fa-solid fa-notes-medical"></i> ${service.nome}</span>
        <span>R$ ${Number(service.preco).toFixed(2).replace('.', ',')} (${service.duracaoMin} min)</span>
    `;

    // Reseta estado de data/hora caso mude o serviço
    DOM.inputDate.value = '';
    AppState.selectedDate = '';
    AppState.selectedTime = '';
    DOM.btnNextTo3.disabled = true;
    showTimeState('placeholder');

    // Avança para o Passo 2 após breve delay para feedback visual
    setTimeout(() => {
        goToStep(2);
    }, 300);
}

// =====================================================================
// CARREGAMENTO E RENDERIZAÇÃO DOS HORÁRIOS
// =====================================================================
async function loadTimeSlots() {
    showTimeState('loading');
    DOM.timesGrid.innerHTML = '';

    if (AppState.useMock) {
        setTimeout(() => {
            renderTimeSlots(MOCK_TIMES);
        }, 500);
        return;
    }

    try {
        const url = `${API_URL}?action=horarios&servicoId=${AppState.selectedService.id}&data=${AppState.selectedDate}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('HTTP erro');
        const data = await response.json();

        if (data.success) {
            renderTimeSlots(data.horarios);
        } else {
            throw new Error(data.error);
        }
    } catch (err) {
        console.error('Erro ao buscar horários:', err);
        // Fallback rápido no modo local
        showTimeState('error');
    }
}

function showTimeState(state) {
    DOM.timesLoading.classList.add('hidden');
    DOM.timesPlaceholder.classList.add('hidden');
    DOM.timesError.classList.add('hidden');
    DOM.timesEmpty.classList.add('hidden');
    DOM.timesGrid.classList.add('hidden');

    if (state === 'loading') DOM.timesLoading.classList.remove('hidden');
    else if (state === 'placeholder') DOM.timesPlaceholder.classList.remove('hidden');
    else if (state === 'error') DOM.timesError.classList.remove('hidden');
    else if (state === 'empty') DOM.timesEmpty.classList.remove('hidden');
    else if (state === 'grid') DOM.timesGrid.classList.remove('hidden');
}

function renderTimeSlots(times) {
    if (!times || times.length === 0) {
        showTimeState('empty');
        return;
    }

    showTimeState('grid');

    times.forEach(time => {
        const slot = document.createElement('div');
        slot.className = 'time-slot';
        slot.textContent = time;

        slot.addEventListener('click', () => {
            AppState.selectedTime = time;

            // Marca ativo
            document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
            slot.classList.add('selected');

            // Ativa botão de avançar
            DOM.btnNextTo3.disabled = false;
        });

        DOM.timesGrid.appendChild(slot);
    });
}

// =====================================================================
// FORMULÁRIO DE CONFIRMAÇÃO
// =====================================================================
function renderSummary() {
    const dataPartes = AppState.selectedDate.split('-');
    const dataFormatada = `${dataPartes[2]}/${dataPartes[1]}/${dataPartes[0]}`;

    DOM.appointmentSummary.innerHTML = `
        <div class="summary-row">
            <span class="summary-label">Procedimento</span>
            <span class="summary-value">${AppState.selectedService.nome}</span>
        </div>
        <div class="summary-row">
            <span class="summary-label">Duração</span>
            <span class="summary-value">${AppState.selectedService.duracaoMin} minutos</span>
        </div>
        <div class="summary-row">
            <span class="summary-label">Valor</span>
            <span class="summary-value">R$ ${Number(AppState.selectedService.preco).toFixed(2).replace('.', ',')}</span>
        </div>
        <div class="summary-row">
            <span class="summary-label">Data</span>
            <span class="summary-value">${dataFormatada}</span>
        </div>
        <div class="summary-row">
            <span class="summary-label">Horário</span>
            <span class="summary-value">${AppState.selectedTime}h</span>
        </div>
    `;
}

async function handleFormSubmit(e) {
    e.preventDefault();

    AppState.clientName = DOM.clientNameInput.value.trim();
    AppState.clientWhatsapp = DOM.clientWhatsappInput.value.replace(/\D/g, ''); // só números

    DOM.bookingLoading.classList.remove('hidden');
    DOM.btnSubmitBooking.disabled = true;
    DOM.btnBackTo2.disabled = true;

    const payload = {
        action: 'criarAgendamento',
        servicoId: String(AppState.selectedService.id),
        data: AppState.selectedDate,
        hora: AppState.selectedTime,
        nome: AppState.clientName,
        whatsapp: AppState.clientWhatsapp
    };

    if (AppState.useMock) {
        setTimeout(() => {
            const mockResult = {
                success: true,
                agendamento: {
                    id: Math.random().toString(36).substr(2, 9).toUpperCase(),
                    servicoNome: AppState.selectedService.nome,
                    data: AppState.selectedDate,
                    hora: AppState.selectedTime
                }
            };
            handleBookingSuccess(mockResult);
        }, 1500);
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('HTTP erro ao salvar');
        const data = await response.json();

        if (data.success) {
            handleBookingSuccess(data);
        } else {
            alert(`Erro ao reservar: ${data.error}`);
            DOM.bookingLoading.classList.add('hidden');
            DOM.btnSubmitBooking.disabled = false;
            DOM.btnBackTo2.disabled = false;
        }
    } catch (err) {
        console.error('Falha de rede ao tentar criar agendamento:', err);
        alert('Não foi possível se conectar ao sistema. O agendamento foi processado em modo demonstração local para fins de teste.');
        // Fallback mock
        handleBookingSuccess({
            success: true,
            agendamento: {
                id: "MOCK-LOCAL",
                servicoNome: AppState.selectedService.nome,
                data: AppState.selectedDate,
                hora: AppState.selectedTime
            }
        });
    }
}

function handleBookingSuccess(res) {
    AppState.bookingResult = res.agendamento;
    DOM.bookingLoading.classList.add('hidden');

    const dataPartes = res.agendamento.data.split('-');
    const dataFormatada = `${dataPartes[2]}/${dataPartes[1]}/${dataPartes[0]}`;

    // Renderiza detalhes do sucesso
    DOM.successDetails.innerHTML = `
        <div class="summary-row">
            <span class="summary-label">Protocolo</span>
            <span class="summary-value" style="font-family: monospace; font-size: 15px;">${res.agendamento.id}</span>
        </div>
        <div class="summary-row">
            <span class="summary-label">Paciente</span>
            <span class="summary-value">${AppState.clientName}</span>
        </div>
        <div class="summary-row">
            <span class="summary-label">Procedimento</span>
            <span class="summary-value">${res.agendamento.servicoNome}</span>
        </div>
        <div class="summary-row">
            <span class="summary-label">Data e Hora</span>
            <span class="summary-value">${dataFormatada} às ${res.agendamento.hora}h</span>
        </div>
    `;

    goToStep(4);
}

function resetBookingFlow() {
    // Limpa estado
    AppState.selectedService = null;
    AppState.selectedDate = '';
    AppState.selectedTime = '';
    AppState.clientName = '';
    AppState.clientWhatsapp = '';
    AppState.bookingResult = null;

    // Reseta form
    DOM.formClient.reset();
    DOM.inputDate.value = '';
    DOM.btnNextTo3.disabled = true;

    // Remove seleções visuais
    document.querySelectorAll('.service-card').forEach(card => card.classList.remove('selected'));

    // Volta ao passo 1
    goToStep(1);
}

// =====================================================================
// PAINEL ADMINISTRATIVO
// =====================================================================
function handleAdminLogin() {
    const token = DOM.adminTokenInput.value.trim();
    if (!token) {
        alert('Por favor, informe seu token UUID administrativo.');
        return;
    }

    AppState.adminToken = token;
    DOM.adminAuthSection.classList.add('hidden');
    DOM.adminContentSection.classList.remove('hidden');

    loadAdminAppointments();
}

async function loadAdminAppointments() {
    DOM.adminLoading.classList.remove('hidden');
    DOM.adminTbody.innerHTML = '';
    DOM.adminEmpty.classList.add('hidden');

    const targetDate = DOM.adminDateInput.value;
    if (!targetDate) return;

    if (AppState.useMock) {
        setTimeout(() => {
            DOM.adminLoading.classList.add('hidden');
            const mocks = [
                { id: "A-123", hora: "09:00", servico: "Consulta Geral", profissional: "Dra. Ana Silva", cliente: "Maria Souza", whatsapp: "5511999998888", status: "Confirmado" },
                { id: "B-456", hora: "14:15", servico: "Limpeza Dentária", profissional: "Dr. João Costa", cliente: "Pedro Santos", whatsapp: "5521988887777", status: "Confirmado" },
                { id: "C-789", hora: "16:30", servico: "Clareamento Dental", profissional: "Dra. Ana Silva", cliente: "Carla Oliveira", whatsapp: "5511977776666", status: "Cancelado" }
            ];
            renderAdminAppointments(mocks);
        }, 600);
        return;
    }

    try {
        const url = `${API_URL}?action=agendamentosDoDia&data=${targetDate}&token=${AppState.adminToken}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('HTTP erro');
        const data = await response.json();

        DOM.adminLoading.classList.add('hidden');
        if (data.success) {
            renderAdminAppointments(data.agendamentos);
        } else {
            alert(`Falha: ${data.error}`);
            // Volta para a auth se o token for rejeitado
            DOM.adminAuthSection.classList.remove('hidden');
            DOM.adminContentSection.classList.add('hidden');
        }
    } catch (err) {
        console.error(err);
        alert('Erro ao carregar agendamentos. Revertido para modo local.');
        DOM.adminLoading.classList.add('hidden');
    }
}

function renderAdminAppointments(list) {
    if (!list || list.length === 0) {
        DOM.adminEmpty.classList.remove('hidden');
        return;
    }

    list.forEach(item => {
        const tr = document.createElement('tr');

        const isConfirmado = item.status !== 'Cancelado';
        const badgeClass = isConfirmado ? 'badge-success' : 'badge-danger';
        const actionBtn = isConfirmado
            ? `<button class="btn-danger-sm" onclick="cancelAppointment('${item.id}')"><i class="fa-solid fa-ban"></i> Cancelar</button>`
            : `<span style="color: var(--text-light)">Nenhuma</span>`;

        tr.innerHTML = `
            <td><strong>${item.hora}</strong></td>
            <td>${item.cliente}</td>
            <td><a href="https://wa.me/${item.whatsapp}" target="_blank" style="color: var(--primary); text-decoration: none; font-weight: 600;"><i class="fa-brands fa-whatsapp"></i> ${item.whatsapp}</a></td>
            <td>${item.servico}</td>
            <td><span class="badge ${badgeClass}">${item.status}</span></td>
            <td>${actionBtn}</td>
        `;
        DOM.adminTbody.appendChild(tr);
    });
}

// Expõe globalmente para os botões inline do HTML funcionarem
window.cancelAppointment = async function (id) {
    if (!confirm('Deseja realmente cancelar este agendamento?')) return;

    if (AppState.useMock) {
        alert('Cancelamento processado localmente!');
        loadAdminAppointments();
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'cancelarAgendamento',
                id: id,
                token: AppState.adminToken
            })
        });
        const data = await response.json();

        if (data.success) {
            alert('Agendamento cancelado com sucesso!');
            loadAdminAppointments();
        } else {
            alert(`Erro ao cancelar: ${data.error}`);
        }
    } catch (err) {
        console.error(err);
        alert('Erro ao tentar cancelar.');
    }
};
