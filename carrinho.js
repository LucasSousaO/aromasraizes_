const FRETE_API_URL = "https://aromasraizesapi.vercel.app/api/frete";

const freteState = {
  cepMasked: "",
  pac: null,   // { price, delivery_time }
  sedex: null, // { price, delivery_time }
  escolhido: null // "PAC" | "SEDEX"
};

function onlyDigits(s){ return String(s||"").replace(/\D/g,""); }

function formatBRL(value){
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("pt-BR",{ style:"currency", currency:"BRL" });
}

// Máscara CEP 00000-000
function attachCepMask() {
  const el = document.getElementById("cepInput");
  if (!el) return;
  el.addEventListener("input", () => {
    let v = onlyDigits(el.value).slice(0,8);
    if (v.length > 5) v = v.slice(0,5) + "-" + v.slice(5);
    el.value = v;
  });
}

// ✅ ADAPTE para pegar o carrinho real
function getCartProductsForFreight() {
  // Exemplo: se você tiver inputs #qtd30 e #qtd110
  const q30 = Number(document.querySelector("#qtd30")?.value || 0);
  const q110 = Number(document.querySelector("#qtd110")?.value || 0);

  const products = [];
  if (q30 > 0) products.push({
    id: "vela_30g",
    width: 8, height: 5, length: 8,
    weight: 0.06, insurance_value: 30,
    quantity: q30
  });
  if (q110 > 0) products.push({
    id: "vela_110g",
    width: 10, height: 6, length: 10,
    weight: 0.15, insurance_value: 60,
    quantity: q110
  });

  return products;
}

function showFreteAreaIfNeeded() {
  const local = document.getElementById("local")?.value;
  const area = document.getElementById("local");
  if (!area) return;

  const isFrete = local === "Frete";
  area.style.display = isFrete ? "block" : "none";

  if (!isFrete) {
    // limpa seleção de frete quando voltar pra retirada
    freteState.cepMasked = "";
    freteState.pac = null;
    freteState.sedex = null;
    freteState.escolhido = null;

    const statusEl = document.getElementById("freteStatus");
    const resEl = document.getElementById("freteResultados");
    if (statusEl) statusEl.textContent = "";
    if (resEl) resEl.style.display = "none";

    document.querySelectorAll('input[name="freteOpcao"]').forEach(r => r.checked = false);
  }
}

function findPacSedex(options){
  const pac = options.find(o => /pac/i.test(o.name));
  const sedex = options.find(o => /sedex/i.test(o.name));
  return { pac, sedex };
}

async function calcularFrete() {
  const cepInput = document.getElementById("cepInput");
  const statusEl = document.getElementById("freteStatus");
  const resultadosEl = document.getElementById("freteResultados");

  const cepMasked = cepInput.value.trim();
  const cep = onlyDigits(cepMasked);

  if (cep.length !== 8) {
    statusEl.textContent = "Informe um CEP válido (00000-000).";
    resultadosEl.style.display = "none";
    return;
  }

  const products = getCartProductsForFreight();
  if (!products.length) {
    statusEl.textContent = "Adicione itens no carrinho antes de calcular o frete.";
    resultadosEl.style.display = "none";
    return;
  }

  statusEl.textContent = "Calculando frete...";
  resultadosEl.style.display = "none";

  try {
    const resp = await fetch(FRETE_API_URL, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ toPostalCode: cep, products })
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("Erro frete:", data);
      statusEl.textContent = "Não foi possível calcular o frete agora. Tente novamente.";
      return;
    }

    const options = (data.options || []).map(o => ({
      name: String(o.name || ""),
      price: Number(o.price ?? 0),
      delivery_time: Number(o.delivery_time ?? 0)
    }));

    const { pac, sedex } = findPacSedex(options);
    if (!pac || !sedex) {
      statusEl.textContent = "Não foi possível obter PAC e SEDEX para este CEP.";
      return;
    }

    freteState.cepMasked = cepMasked;
    freteState.pac = { price: pac.price, delivery_time: pac.delivery_time };
    freteState.sedex = { price: sedex.price, delivery_time: sedex.delivery_time };
    freteState.escolhido = null;

    document.getElementById("pacLabel").textContent =
      `PAC — ${formatBRL(pac.price)} • ${pac.delivery_time} dia(s)`;
    document.getElementById("sedexLabel").textContent =
      `SEDEX — ${formatBRL(sedex.price)} • ${sedex.delivery_time} dia(s)`;

    // Obrigatório selecionar 1
    document.querySelectorAll('input[name="freteOpcao"]').forEach(r => r.checked = false);

    statusEl.textContent = "Frete calculado. Selecione PAC ou SEDEX (obrigatório).";
    resultadosEl.style.display = "block";

  } catch (e) {
    console.error(e);
    statusEl.textContent = "Erro ao calcular. Verifique sua conexão e tente novamente.";
  }
}

function bindFreteChoice() {
  document.querySelectorAll('input[name="freteOpcao"]').forEach(radio => {
    radio.addEventListener("change", () => {
      freteState.escolhido = radio.value; // PAC ou SEDEX
    });
  });
}

// Use isso na sua função de montar mensagem
function getEntregaTextForWhatsApp() {
  const local = document.getElementById("local")?.value;

  if (local === "Atibaia") return "Local: Retirada em Atibaia";
  if (local === "Belo Horizonte") return "Local: Retirada em Belo Horizonte";

  // Frete
  if (!freteState.cepMasked) return null;
  if (!freteState.escolhido) return null;

  const info = freteState.escolhido === "PAC" ? freteState.pac : freteState.sedex;
  if (!info) return null;

  return [
    "Local: Frete (Correios)",
    `CEP: ${freteState.cepMasked}`,
    `Serviço: ${freteState.escolhido}`,
    `Valor do frete: ${formatBRL(info.price)}`,
    `Prazo: ${info.delivery_time} dia(s)`
  ].join("\n");
}

document.addEventListener("DOMContentLoaded", () => {
  // Mostrar/ocultar bloco de frete ao mudar o select
  document.getElementById("local")?.addEventListener("change", showFreteAreaIfNeeded);
  showFreteAreaIfNeeded();

  attachCepMask();
  bindFreteChoice();

  document.getElementById("btnCalcularFrete")?.addEventListener("click", calcularFrete);
});
