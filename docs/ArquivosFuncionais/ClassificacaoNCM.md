# 1. Objetivo do Sistema

O presente sistema tem como objetivo identificar, analisar e priorizar inconsistências relacionadas à classificação fiscal de produtos (NCM - Nomenclatura Comum do Mercosul), com foco em:

- Detectar divergências entre o NCM cadastrado internamente e o NCM informado em documentos fiscais (notas fiscais de entrada);
- Avaliar a coerência da classificação fiscal dos produtos, mesmo nos casos em que não há divergência aparente;
- Medir o impacto tributário potencial decorrente de classificações incorretas;
- Classificar e priorizar riscos fiscais com base em critérios objetivos e mensuráveis;
- Apoiar a tomada de decisão quanto à necessidade de correção, monitoramento ou recuperação de tributos.

O sistema não tem como objetivo substituir a análise fiscal especializada, mas sim atuar como um mecanismo de apoio à decisão, reduzindo o esforço manual e aumentando a eficiência na identificação de riscos e oportunidades fiscais.

O foco principal está na construção de um motor inteligente de validação e priorização, capaz de operar em ambientes com alto volume de documentos fiscais.

# 2. Escopo do Sistema

## 2.1 Escopo Funcional

O sistema tem como escopo a análise e validação da classificação fiscal de produtos (NCM), com base na integração entre dados cadastrais internos e documentos fiscais de entrada.

Estão incluídas no escopo as seguintes funcionalidades:

### 📦 Análise de Cadastro de Produtos
- Leitura e interpretação da base de produtos cadastrados;
- Avaliação do NCM atualmente atribuído aos produtos;
- Identificação de inconsistências internas e padrões divergentes.

### 🧾 Análise de Notas Fiscais de Entrada
- Processamento de notas fiscais recebidas (mercadorias e serviços, quando aplicável);
- Extração de informações relevantes (produto, descrição, NCM, valores, fornecedor, data);
- Consolidação do histórico de movimentações por produto.

### 🔗 Vínculo entre Produtos e Itens de Nota Fiscal
- Associação entre itens das notas fiscais e produtos do cadastro interno;
- Tratamento de divergências de descrição e identificação de equivalência entre itens;
- Criação de histórico consolidado por produto.

### 🔍 Validação de NCM
- Comparação entre NCM do cadastro interno e NCM das notas fiscais;
- Identificação de divergências operacionais;
- Validação de plausibilidade da classificação fiscal, mesmo quando não há divergência aparente.

### ⚖️ Análise de Impacto Tributário
- Avaliação do impacto potencial da classificação do NCM sobre tributos (ICMS, IPI, PIS, COFINS);
- Identificação de cenários de pagamento a maior ou a menor;
- Detecção de possíveis impactos relacionados à Substituição Tributária (ST).

### 🔁 Análise de Recorrência e Consistência
- Identificação de padrões de divergência por produto, fornecedor e período;
- Classificação de erros como isolados ou recorrentes;
- Avaliação de consistência histórica da classificação fiscal.

### 📊 Motor de Score de Confiança do NCM
- Cálculo de score de confiança baseado em múltiplos critérios (consistência, recorrência, coerência, impacto tributário, histórico);
- Classificação automática dos produtos com base no nível de confiança do NCM;
- Apoio à priorização de análises e ações.

### 🎯 Priorização e Classificação de Risco
- Classificação dos casos com base em impacto financeiro, risco fiscal e recorrência;
- Identificação de itens críticos, relevantes e de baixa prioridade;
- Geração de listas priorizadas para atuação.

### 🧠 Suporte à Tomada de Decisão
- Sugestão de ações com base nas análises realizadas:
  - Ignorar;
  - Monitorar;
  - Corrigir cadastro;
  - Investigar;
  - Regularizar;
  - Recuperar tributos;
- Apoio à definição de estratégias fiscais.

---

## 2.2 Escopo Não Funcional (fora do escopo)

O sistema não contempla:

- A correção automática de documentos fiscais já emitidos ou recebidos;
- A substituição de análise técnica por especialista fiscal ou tributário;
- A geração automática de obrigações acessórias (ex: SPED, declarações fiscais);
- A execução automática de pedidos de restituição ou compensação tributária;
- A garantia de conformidade fiscal absoluta, atuando apenas como ferramenta de apoio à decisão;
- A definição oficial do NCM correto para fins legais, sem validação humana.

---

## 2.3 Premissas

- Os dados de entrada (cadastro de produtos e notas fiscais) possuem qualidade mínima para análise;
- Existe vínculo possível entre itens de nota fiscal e produtos internos;
- A legislação tributária aplicável pode variar por estado e período, devendo ser considerada como variável externa ao sistema;
- O sistema atua como apoio analítico, não como fonte normativa oficial.

---

## 2.4 Limitações

- A identificação do NCM correto pode depender de interpretação técnica não totalmente automatizável;
- Diferenças de descrição entre fornecedores podem impactar a precisão das análises;
- A análise tributária pode ser limitada pela disponibilidade e qualidade das regras fiscais parametrizadas;
- O sistema depende de histórico acumulado para aumento de precisão em análises e scoring.

# 3. Definições e Conceitos

## 3.1 NCM (Nomenclatura Comum do Mercosul)

Código numérico de 8 dígitos utilizado para classificar fiscalmente produtos, com base no Sistema Harmonizado (SH).

O NCM é utilizado para:
- Determinação de tributos;
- Controle fiscal e aduaneiro;
- Padronização de mercadorias.

---

## 3.2 Produto (Cadastro Interno)

Item registrado no sistema da empresa, contendo:
- Código interno;
- Descrição;
- NCM atribuído;
- Demais atributos relevantes.

Representa a “verdade interna” da empresa.

---

## 3.3 Item de Nota Fiscal

Registro de um produto dentro de uma nota fiscal recebida, contendo:
- Descrição do fornecedor;
- NCM informado;
- Valores;
- Dados fiscais associados.

Representa a “visão externa” (fornecedor/mercado).

---

## 3.4 Divergência de NCM

Ocorre quando há diferença entre:

- NCM do cadastro interno  
e  
- NCM informado na nota fiscal

Classificação:
- Divergência operacional: diferença direta entre códigos;
- Divergência potencial: códigos iguais, mas possivelmente incorretos.

---

## 3.5 Falso Positivo de Conformidade

Situação em que:
- NCM do cadastro = NCM da nota fiscal  
- Porém ambos estão incorretos

Representa um risco oculto, não detectável por validação simples de igualdade.

---

## 3.6 Validação de Plausibilidade

Processo de verificação se o NCM atribuído é coerente com:

- Descrição do produto;
- Material;
- Função;
- Categoria;

Independe da existência de divergência entre cadastro e nota.

---

## 3.7 Impacto Tributário

Diferença potencial de carga tributária decorrente da classificação do NCM.

Classificação:
- Sem impacto;
- Impacto leve;
- Impacto relevante;
- Impacto crítico (ex: envolve Substituição Tributária).

---

## 3.8 Substituição Tributária (ST)

Regime tributário no qual o recolhimento do imposto é antecipado na cadeia.

A presença de ST aumenta significativamente o risco fiscal associado ao NCM.

---

## 3.9 Recorrência

Frequência com que uma determinada divergência ou padrão ocorre.

Classificação:
- Evento isolado;
- Evento recorrente;
- Padrão consolidado.

---

## 3.10 Consistência

Grau de uniformidade na utilização de um NCM para um mesmo produto ao longo do tempo.

Alta consistência:
- Mesmo NCM utilizado repetidamente

Baixa consistência:
- Variação frequente de NCM

---

## 3.11 Score de Confiança do NCM

Indicador numérico (0 a 100) que representa a probabilidade de um NCM estar correto.

Baseado em múltiplos fatores, incluindo:
- Consistência;
- Recorrência;
- Coerência com descrição;
- Convergência de fornecedores;
- Impacto tributário;
- Histórico validado.

---

## 3.12 Materialidade

Critério utilizado para determinar a relevância de uma divergência, considerando:

- Valor financeiro envolvido;
- Volume de ocorrências;
- Custo de tratamento;
- Risco fiscal associado.

---

## 3.13 Risco Fiscal

Probabilidade de exposição a autuações, multas ou inconsistências fiscais.

Pode ser influenciado por:
- Classificação incorreta de NCM;
- Divergências recorrentes;
- Impacto tributário relevante;
- Envolvimento de regimes especiais (ex: ST).

---

## 3.14 Ação Recomendada

Resultado da análise do sistema, indicando a conduta sugerida:

- Ignorar;
- Monitorar;
- Corrigir cadastro;
- Investigar;
- Regularizar;
- Recuperar tributos.

---

## 3.15 Base de Produtos

Conjunto estruturado de todos os produtos cadastrados na empresa.

---

## 3.16 Base de Notas Fiscais

Conjunto de todas as notas fiscais de entrada utilizadas para análise.

---

## 3.17 Motor de Decisão

Componente lógico do sistema responsável por:

- Processar validações;
- Calcular score;
- Classificar riscos;
- Sugerir ações.
# 4. Bases de Dados Necessárias

## 4.1 Visão Geral

O sistema depende de bases de dados estruturadas que permitam:

- Comparação entre cadastro interno e documentos fiscais;
- Análise histórica e recorrência;
- Cálculo de impacto e score de confiança;
- Priorização de riscos e tomada de decisão.

As bases devem ser integradas e permitir rastreabilidade entre produtos e movimentações fiscais.

---

## 4.2 Base de Produtos (Cadastro Interno)

### Objetivo:
Representar a estrutura interna de produtos da empresa.

### Campos mínimos necessários:

- Código do produto (identificador único)
- Descrição do produto
- NCM cadastrado
- Unidade de medida
- Categoria (opcional, mas recomendado)
- Status (ativo/inativo)
- Data de criação/atualização

### Observações:
- Deve existir padronização de descrições;
- Produtos duplicados devem ser evitados;
- Essa base representa a referência principal do sistema.

---

## 4.3 Base de Notas Fiscais de Entrada

### Objetivo:
Representar todas as movimentações de entrada de mercadorias e serviços.

### Campos mínimos necessários (por item de nota):

- Identificador da nota fiscal
- Data de emissão/entrada
- CNPJ do fornecedor
- Nome do fornecedor
- Código do produto (quando houver vínculo)
- Descrição do item na nota
- NCM informado na nota
- CFOP
- Quantidade
- Valor do item
- Valores de tributos (ICMS, IPI, PIS, COFINS, ST quando aplicável)

### Observações:
- Deve permitir análise item a item (não apenas por nota);
- Histórico deve ser mantido (não sobrescrever dados);
- Base essencial para análise de recorrência e impacto.

---

## 4.4 Base de Vínculo Produto x Nota Fiscal

### Objetivo:
Garantir a associação entre itens das notas fiscais e produtos do cadastro interno.

### Estrutura:

- Código do produto interno
- Identificador do item da nota fiscal
- Grau de confiança do vínculo (opcional, recomendado)
- Método de associação (manual, automático, regra)

### Observações:
- Pode exigir tratamento de inconsistências de descrição;
- Pode utilizar regras de similaridade ou histórico;
- É crítica para escalabilidade do sistema.

---

## 4.5 Base Histórica Consolidada

### Objetivo:
Permitir análise evolutiva e identificação de padrões.

### Informações consolidadas:

- Histórico de NCM por produto
- Frequência de uso por NCM
- Histórico por fornecedor
- Volume e valores por período

### Observações:
- Base utilizada para cálculo de score e recorrência;
- Deve ser atualizada continuamente;
- Pode ser derivada das notas fiscais.

---

## 4.6 Base de Regras Tributárias

### Objetivo:
Permitir análise de impacto tributário.

### Informações necessárias:

- Regras de incidência de ICMS
- Regras de IPI
- Regras de PIS/COFINS
- Regras de Substituição Tributária (ST)
- Variações por estado (UF)
- Variações por período (vigência)

### Observações:
- Pode ser parametrizada ou integrada com sistemas externos;
- Complexidade alta, mas essencial para análises mais precisas;
- Deve permitir atualização frequente.

---

## 4.7 Base de Referência de NCM (Opcional, Recomendado)

### Objetivo:
Apoiar validação de plausibilidade do NCM.

### Informações possíveis:

- Descrição oficial do NCM
- Categoria do produto
- Materiais típicos
- Exemplos de uso

### Observações:
- Utilizada para validação semântica;
- Apoia identificação de erros invisíveis;
- Pode evoluir com aprendizado do sistema.

---

## 4.8 Base de Validação Manual (Opcional, Alta Relevância)

### Objetivo:
Registrar validações humanas realizadas ao longo do tempo.

### Campos:

- Produto
- NCM validado
- Data da validação
- Usuário responsável
- Observações

### Observações:
- Aumenta precisão do score;
- Cria base de “verdade confiável”;
- Fundamental para evolução do sistema.

---

## 4.9 Requisitos Gerais das Bases

As bases de dados devem atender aos seguintes requisitos:

- Integridade: dados consistentes e confiáveis;
- Rastreabilidade: possibilidade de auditoria;
- Histórico: manutenção de dados ao longo do tempo;
- Escalabilidade: suporte a alto volume de registros;
- Atualização contínua: capacidade de ingestão frequente de novos dados.
# 5. Regras de Validação

## 5.1 Visão Geral

As regras de validação têm como objetivo identificar inconsistências, avaliar coerência da classificação fiscal e gerar insumos para o cálculo de risco e tomada de decisão.

As regras são organizadas em camadas:

1. Validação Estrutural  
2. Validação de Divergência  
3. Validação de Consistência  
4. Validação de Plausibilidade  
5. Validação Tributária  
6. Validação de Recorrência  

Cada regra possui um identificador único para rastreabilidade.

---

## 5.2 Validação Estrutural

### REGRA V001 – NCM obrigatório no cadastro
SE:
- Produto não possui NCM cadastrado

ENTÃO:
- Classificar como erro estrutural
- Prioridade: Alta

---

### REGRA V002 – NCM obrigatório na nota fiscal
SE:
- Item da nota fiscal não possui NCM informado

ENTÃO:
- Classificar como inconsistência de documento
- Prioridade: Alta

---

### REGRA V003 – Vínculo produto x nota inexistente
SE:
- Item da nota fiscal não está vinculado a produto interno

ENTÃO:
- Classificar como item não rastreável
- Prioridade: Alta

---

## 5.3 Validação de Divergência

### REGRA V101 – Divergência direta de NCM
SE:
- NCM cadastro ≠ NCM nota fiscal

ENTÃO:
- Classificar como divergência operacional
- Direcionar para análise tributária

---

### REGRA V102 – Convergência de NCM
SE:
- NCM cadastro = NCM nota fiscal

ENTÃO:
- Classificar como conformidade operacional
- Direcionar para validação de plausibilidade

---

## 5.4 Validação de Consistência

### REGRA V201 – Consistência histórica alta
SE:
- Produto possui o mesmo NCM em mais de X% das ocorrências (ex: 90%)

ENTÃO:
- Classificar como alta consistência
- Impacto positivo no score

---

### REGRA V202 – Baixa consistência histórica
SE:
- Produto apresenta múltiplos NCMs com distribuição relevante

ENTÃO:
- Classificar como inconsistência
- Impacto negativo no score

---

### REGRA V203 – Variação por fornecedor
SE:
- Diferentes fornecedores utilizam NCMs distintos para o mesmo produto

ENTÃO:
- Classificar como divergência por fornecedor
- Direcionar para análise de plausibilidade

---

## 5.5 Validação de Plausibilidade

### REGRA V301 – Incompatibilidade com descrição
SE:
- NCM não condiz com a descrição do produto (material, função ou categoria)

ENTÃO:
- Classificar como erro potencial
- Prioridade: Alta

---

### REGRA V302 – Compatibilidade com descrição
SE:
- NCM é coerente com a descrição do produto

ENTÃO:
- Classificar como plausível
- Impacto positivo no score

---

### REGRA V303 – Divergência com padrão histórico validado
SE:
- NCM atual difere de NCM previamente validado manualmente

ENTÃO:
- Classificar como inconsistência relevante
- Prioridade: Alta

---

## 5.6 Validação Tributária

### REGRA V401 – Alteração de carga tributária
SE:
- NCM alternativo resulta em diferença de tributação

ENTÃO:
- Classificar impacto tributário:
  - Leve
  - Relevante
  - Crítico

---

### REGRA V402 – Presença de Substituição Tributária
SE:
- NCM envolve ST

ENTÃO:
- Elevar nível de risco
- Prioridade mínima: Alta

---

### REGRA V403 – Pagamento potencial a menor
SE:
- NCM utilizado resulta em menor carga tributária que o correto

ENTÃO:
- Classificar como risco fiscal
- Prioridade: Crítica

---

### REGRA V404 – Pagamento potencial a maior
SE:
- NCM utilizado resulta em maior carga tributária que o correto

ENTÃO:
- Classificar como oportunidade de recuperação
- Prioridade: Média/Alta

---

## 5.7 Validação de Recorrência

### REGRA V501 – Erro isolado
SE:
- Divergência ocorre em baixa frequência

ENTÃO:
- Classificar como evento isolado
- Reduzir prioridade

---

### REGRA V502 – Erro recorrente
SE:
- Divergência ocorre repetidamente para o mesmo produto

ENTÃO:
- Classificar como padrão de erro
- Aumentar prioridade

---

### REGRA V503 – Padrão consolidado incorreto
SE:
- Alta recorrência de um NCM inconsistente

ENTÃO:
- Classificar como erro estrutural
- Prioridade: Crítica

---

## 5.8 Validação de Materialidade

### REGRA V601 – Baixo impacto financeiro
SE:
- Valor envolvido abaixo de limite mínimo

ENTÃO:
- Reduzir prioridade
- Possível ação: ignorar ou monitorar

---

### REGRA V602 – Alto impacto financeiro
SE:
- Valor envolvido acima de limite relevante

ENTÃO:
- Aumentar prioridade
- Direcionar para ação

---

## 5.9 Consolidação das Validações

Após execução das regras:

- Cada item recebe múltiplas classificações;
- As classificações alimentam o cálculo do score;
- O conjunto de validações será utilizado para:
  - Classificação de risco;
  - Priorização;
  - Sugestão de ação.

# 6. Motor de Score de Confiança do NCM

## 6.1 Objetivo

O motor de score tem como objetivo calcular um indicador numérico (0 a 100) que represente o grau de confiança na classificação fiscal (NCM) de um produto.

O score é utilizado para:

- Priorizar análises;
- Identificar riscos fiscais;
- Apoiar decisões automatizadas;
- Reduzir esforço manual.

---

## 6.2 Estrutura do Score

O score é composto por múltiplos fatores independentes, organizados em dimensões:

1. Consistência
2. Recorrência
3. Convergência de mercado (fornecedores)
4. Plausibilidade semântica
5. Impacto tributário
6. Sensibilidade fiscal (ST)
7. Histórico validado

Cada dimensão contribui com uma pontuação positiva ou negativa.

---

## 6.3 Fórmula Geral

Score Final = Base (100) + Ajustes (positivos e negativos)

Onde:

- Score máximo: 100  
- Score mínimo: 0  

O resultado deve ser limitado ao intervalo [0, 100].

---

## 6.4 Dimensões do Score

### 6.4.1 Consistência (peso: até ±20)

Avalia a uniformidade do NCM ao longo do tempo.

Regras:

- Alta consistência (>90% mesmo NCM):
  +20 pontos

- Consistência moderada (70% a 90%):
  +10 pontos

- Baixa consistência (<70%):
  -20 pontos

---

### 6.4.2 Recorrência (peso: até ±15)

Avalia a repetição do padrão observado.

Regras:

- Padrão recorrente consistente:
  +15 pontos

- Baixa recorrência:
  0 pontos

- Recorrência de erro:
  -15 pontos

---

### 6.4.3 Convergência de Fornecedores (peso: até ±15)

Avalia se diferentes fornecedores utilizam o mesmo NCM.

Regras:

- Alta convergência:
  +15 pontos

- Convergência parcial:
  +5 pontos

- Divergência relevante:
  -15 pontos

---

### 6.4.4 Plausibilidade Semântica (peso: até ±25)

Avalia se o NCM é compatível com a descrição do produto.

Regras:

- Totalmente compatível:
  +25 pontos

- Parcialmente compatível:
  +10 pontos

- Incompatível:
  -30 pontos

---

### 6.4.5 Impacto Tributário (peso: até -20)

Avalia distorções tributárias potenciais.

Regras:

- Sem impacto:
  +10 pontos

- Impacto leve:
  0 pontos

- Impacto relevante:
  -10 pontos

- Impacto crítico:
  -20 pontos

---

### 6.4.6 Sensibilidade Fiscal (ST) (peso: até -25)

Avalia risco adicional quando há Substituição Tributária.

Regras:

- Produto sem ST:
  0 pontos

- ST consistente:
  +5 pontos

- ST inconsistente:
  -25 pontos

---

### 6.4.7 Histórico Validado (peso: até +20)

Avalia validações humanas anteriores.

Regras:

- Validado recentemente:
  +20 pontos

- Validado antigo:
  +10 pontos

- Não validado:
  0 pontos

---

## 6.5 Ajustes e Penalidades Especiais

### Penalidade por falso positivo de conformidade

SE:
- NCM cadastro = NCM NF
- Baixa plausibilidade

ENTÃO:
- Penalidade adicional de -20 pontos

---

### Penalidade por inconsistência estrutural

SE:
- Múltiplos NCMs com alta frequência

ENTÃO:
- Penalidade adicional de -15 pontos

---

## 6.6 Classificação por Faixa de Score

| Faixa | Classificação | Interpretação |
|------|-------------|--------------|
| 90 – 100 | Muito confiável | Alta probabilidade de correção |
| 70 – 89 | Confiável | Baixo risco |
| 40 – 69 | Atenção | Necessita revisão |
| 0 – 39 | Crítico | Alta probabilidade de erro |

---

## 6.7 Granularidade do Score

O score pode ser calculado em diferentes níveis:

- Por item de nota fiscal  
- Por produto  
- Por produto + fornecedor  
- Por período  

---

## 6.8 Atualização do Score

- Deve ser recalculado periodicamente;
- Deve ser atualizado a cada nova nota fiscal;
- Deve refletir alterações no cadastro e validações manuais.

---

## 6.9 Uso do Score no Sistema

O score será utilizado para:

- Alimentar a priorização de análise;
- Definir filas de trabalho;
- Direcionar ações automatizadas;
- Gerar alertas de risco.

---

## 6.10 Evolução do Modelo

O modelo de score deve permitir:

- Ajuste de pesos por parametrização;
- Inclusão de novas dimensões;
- Aprendizado com histórico (machine learning futuro);
- Customização por tipo de produto ou segmento.

---# 7. Classificação de Risco e Prioridade

## 7.1 Objetivo

Classificar cada item analisado com base no seu nível de risco fiscal e prioridade de tratamento, utilizando como base:

- Score de confiança do NCM;
- Impacto tributário;
- Recorrência;
- Materialidade (valor financeiro).

Essa classificação será utilizada para:

- Definir ordem de atuação;
- Direcionar recursos;
- Alimentar filas de trabalho;
- Apoiar tomada de decisão.

---

## 7.2 Variáveis de Entrada

A classificação de risco considera as seguintes variáveis:

### 7.2.1 Score de Confiança
- Indicador de 0 a 100

---

### 7.2.2 Impacto Tributário
Classificação:
- Sem impacto
- Leve
- Relevante
- Crítico

---

### 7.2.3 Recorrência
Classificação:
- Isolado
- Recorrente
- Padrão consolidado

---

### 7.2.4 Materialidade (Financeira)
Classificação (parametrizável):
- Baixa
- Média
- Alta

---

## 7.3 Matriz de Risco

A classificação final será baseada na combinação das variáveis.

### 7.3.1 Regras gerais

- Baixo score → aumenta risco  
- Alto impacto tributário → aumenta risco  
- Alta recorrência → aumenta risco  
- Alta materialidade → aumenta prioridade  

---

## 7.4 Classificação de Risco

### 🔴 Risco Crítico

SE:
- Score < 40  
E  
- Impacto tributário relevante ou crítico  

OU  
- Envolve Substituição Tributária com inconsistência  

ENTÃO:
- Classificar como Risco Crítico  
- Prioridade máxima  

---

### 🟠 Risco Alto

SE:
- Score entre 40 e 60  
E  
- Impacto tributário relevante  

OU  
- Alta recorrência de erro  

ENTÃO:
- Classificar como Risco Alto  
- Alta prioridade  

---

### 🟡 Risco Médio

SE:
- Score entre 60 e 80  
E/OU  
- Impacto leve  

ENTÃO:
- Classificar como Risco Médio  
- Prioridade moderada  

---

### 🟢 Risco Baixo

SE:
- Score > 80  
E  
- Sem impacto tributário  

ENTÃO:
- Classificar como Risco Baixo  
- Baixa prioridade  

---

## 7.5 Classificação de Prioridade

A prioridade considera risco + materialidade:

### Prioridade Alta
- Risco crítico ou alto  
E  
- Materialidade média ou alta  

---

### Prioridade Média
- Risco médio  
OU  
- Risco alto com baixa materialidade  

---

### Prioridade Baixa
- Risco baixo  
OU  
- Impacto irrelevante  

---

## 7.6 Regras de Ajuste de Prioridade

### Ajuste por recorrência
- Erro recorrente → aumentar prioridade em 1 nível  

---

### Ajuste por volume
- Alto volume de ocorrências → aumentar prioridade  

---

### Ajuste por fornecedor crítico
- Fornecedor com histórico de inconsistência → aumentar prioridade  

---

## 7.7 Saídas da Classificação

Cada item analisado deve conter:

- Score de confiança  
- Nível de risco  
- Nível de prioridade  
- Indicadores de impacto  
- Indicadores de recorrência  

---

## 7.8 Uso Operacional

A classificação deve ser utilizada para:

- Criação de filas de trabalho priorizadas;
- Direcionamento de análise manual;
- Geração de alertas automáticos;
- Apoio à tomada de decisão estratégica.

---# 8. Consulta e Fontes de Referência de NCM

## 8.1 Objetivo

Definir as fontes de dados, métodos de consulta e estratégias utilizadas pelo sistema para:

- Validar a classificação fiscal (NCM);
- Apoiar a análise de plausibilidade;
- Fornecer base confiável para comparação e decisão.

---

## 8.2 Fontes Oficiais

### 8.2.1 Tabela TIPI

Fonte primária oficial de NCM no Brasil.

Contém:
- Estrutura completa do NCM;
- Descrições oficiais;
- Regras de enquadramento.

Utilização no sistema:
- Base principal para validação estrutural;
- Referência para descrição oficial do NCM.

---

### 8.2.2 Sistema Harmonizado (SH)

Base internacional que origina os 6 primeiros dígitos do NCM.

Utilização:
- Padronização internacional;
- Apoio em análise conceitual de classificação.

---

### 8.2.3 Soluções de Consulta (COSIT)

Respostas oficiais emitidas pela administração tributária para casos específicos.

Utilização:
- Referência para casos complexos;
- Base para validações especializadas.

---

## 8.3 Fontes Complementares

### 8.3.1 Base Interna Validada

- Histórico de NCMs validados manualmente;
- Considerada fonte de alta confiabilidade;

Utilização:
- Treinamento do sistema;
- Referência para score;
- Padronização interna.

---

### 8.3.2 Base de Mercado (Fornecedores)

- NCMs utilizados por diferentes fornecedores;

Utilização:
- Identificação de padrões;
- Validação por convergência;
- Não considerada fonte definitiva.

---

### 8.3.3 Bases Públicas e APIs (quando disponíveis)

Exemplos:
- APIs de classificação fiscal
- Bases públicas de comércio exterior

Utilização:
- Apoio à validação automatizada;
- Enriquecimento de dados.

---

## 8.4 Métodos de Consulta

### 8.4.1 Consulta por Código

Entrada:
- NCM completo (8 dígitos)

Saída:
- Descrição oficial;
- Categoria;
- Estrutura hierárquica;

---

### 8.4.2 Consulta por Palavra-chave

Entrada:
- Termos descritivos do produto

Processamento:
- Busca por similaridade textual;
- Retorno de possíveis NCMs compatíveis;

---

### 8.4.3 Consulta por Similaridade

Entrada:
- Produto já classificado

Saída:
- NCMs utilizados em produtos semelhantes;

---

## 8.5 Estratégias de Uso no Sistema

O sistema deve utilizar múltiplas fontes de forma combinada:

- Fonte oficial → validação normativa
- Base interna → padrão confiável
- Mercado → referência comparativa

---

## 8.6 Hierarquia de Confiança das Fontes

Ordem de prioridade:

1. Base interna validada (quando recente e confiável)
2. Fontes oficiais (TIPI, COSIT)
3. Convergência de fornecedores
4. Bases externas e APIs

---

## 8.7 Regras de Utilização

- Nenhuma fonte isolada deve ser considerada absoluta;
- Divergências entre fontes devem gerar alerta;
- A decisão final deve considerar contexto completo (score + validações);

---

## 8.8 Limitações

- A classificação de NCM pode exigir interpretação técnica;
- Nem todos os produtos possuem correspondência direta;
- Fontes externas podem apresentar inconsistências;
- Atualizações legais podem impactar classificações existentes.

---

## 8.9 Integração com o Sistema

As consultas devem alimentar:

- Validação de plausibilidade;
- Motor de score;
- Sugestão de NCM alternativo;
- Análise de divergências.

---# 9. Regras de Decisão (Ações do Sistema)

## 9.1 Objetivo

Definir as ações recomendadas pelo sistema com base na análise realizada, considerando:

- Score de confiança;
- Classificação de risco;
- Impacto tributário;
- Materialidade;
- Recorrência.

---

## 9.2 Tipos de Ação

O sistema deve classificar cada item em uma das seguintes ações:

1. Ignorar  
2. Monitorar  
3. Corrigir Cadastro  
4. Investigar  
5. Regularizar  
6. Recuperar Tributos  

---

## 9.3 Regras de Decisão

### AÇÃO 1 – Ignorar

SE:
- Risco baixo  
E  
- Sem impacto tributário  
E  
- Baixa materialidade  

ENTÃO:
- Não gerar ação operacional  
- Apenas registrar histórico  

---

### AÇÃO 2 – Monitorar

SE:
- Score médio (60–80)  
E  
- Sem impacto relevante  

ENTÃO:
- Acompanhar comportamento  
- Não agir imediatamente  

---

### AÇÃO 3 – Corrigir Cadastro

SE:
- Divergência identificada  
E  
- Alta confiança no NCM correto  

ENTÃO:
- Sugerir ajuste no cadastro interno  

---

### AÇÃO 4 – Investigar

SE:
- Score baixo  
OU  
- Plausibilidade duvidosa  
OU  
- Divergência entre fontes  

ENTÃO:
- Direcionar para análise manual  

---

### AÇÃO 5 – Regularizar

SE:
- Identificado pagamento a menor  
OU  
- Risco fiscal relevante  

ENTÃO:
- Sugerir correção fiscal  
- Avaliar retificação  

---

### AÇÃO 6 – Recuperar Tributos

SE:
- Identificado pagamento a maior  
E  
- Materialidade relevante  

ENTÃO:
- Sugerir processo de recuperação  
- Avaliar compensação ou restituição  

---

## 9.4 Regras de Priorização de Ações

- Ações de regularização têm prioridade sobre recuperação  
- Ações com risco fiscal têm prioridade sobre otimização financeira  
- Ações recorrentes têm prioridade sobre eventos isolados  

---

## 9.5 Saída do Sistema

Para cada item, o sistema deve fornecer:

- Ação recomendada  
- Justificativa baseada nas regras  
- Indicadores utilizados (score, risco, impacto)  

---

## 9.6 Intervenção Humana

- Todas as ações são sugestões  
- A decisão final pode ser validada ou alterada por usuário  
- O sistema deve registrar decisões para aprendizado futuro  

---# 10. Fluxo Lógico do Sistema

## 10.1 Objetivo

Descrever a sequência lógica de processamento do sistema, desde a entrada de dados até a geração de decisões e saídas.

---

## 10.2 Visão Geral do Fluxo

O sistema opera em etapas sequenciais e integradas:

1. Ingestão de dados  
2. Preparação e vínculo  
3. Execução das validações  
4. Cálculo do score  
5. Classificação de risco  
6. Definição de prioridade  
7. Aplicação das regras de decisão  
8. Geração de saídas  

---

## 10.3 Etapas do Processo

### 10.3.1 Ingestão de Dados

Entrada de dados provenientes de:

- Cadastro de produtos  
- Notas fiscais de entrada  
- Bases auxiliares  

Requisitos:
- Dados estruturados  
- Atualização contínua  

---

### 10.3.2 Preparação e Vínculo

- Associação entre itens de nota fiscal e produtos internos  
- Tratamento de inconsistências de descrição  
- Normalização de dados  

Saída:
- Base consolidada produto x nota  

---

### 10.3.3 Execução das Validações

Aplicação das regras definidas no item 5:

- Validação estrutural  
- Divergência  
- Consistência  
- Plausibilidade  
- Tributária  
- Recorrência  

Saída:
- Conjunto de flags e classificações por item  

---

### 10.3.4 Cálculo do Score

- Aplicação do motor de score (item 6)  
- Consolidação das dimensões  
- Geração do score final  

Saída:
- Score de confiança do NCM  

---

### 10.3.5 Classificação de Risco

- Aplicação da matriz de risco (item 7)  
- Cruzamento de variáveis  

Saída:
- Classificação de risco  

---

### 10.3.6 Definição de Prioridade

- Avaliação de materialidade  
- Ajustes por recorrência e volume  

Saída:
- Nível de prioridade  

---

### 10.3.7 Aplicação das Regras de Decisão

- Execução das regras do item 9  

Saída:
- Ação recomendada  

---

### 10.3.8 Geração de Saídas

- Relatórios  
- Alertas  
- Filas de trabalho  
- Indicadores  

---

## 10.4 Execução Contínua

O sistema deve operar de forma contínua:

- Atualização a cada nova nota fiscal  
- Reprocessamento periódico  
- Evolução do histórico  

---

## 10.5 Ciclo de Aprendizado

- Registro de decisões humanas  
- Atualização da base validada  
- Ajuste progressivo do score  

---# 11. Critérios de Materialidade

## 11.1 Objetivo

Definir critérios para avaliar a relevância financeira e operacional de cada divergência identificada.

---

## 11.2 Conceito de Materialidade

Materialidade representa o impacto econômico potencial de uma inconsistência, considerando:

- Valor financeiro envolvido  
- Frequência de ocorrência  
- Custo de tratamento  

---

## 11.3 Dimensões da Materialidade

### 11.3.1 Valor Unitário

- Impacto financeiro por item individual  

---

### 11.3.2 Volume

- Quantidade de ocorrências  

---

### 11.3.3 Impacto Total

Cálculo:

Impacto Total = Valor Unitário x Volume  

---

## 11.4 Classificação de Materialidade

### Baixa
- Impacto financeiro irrelevante  
- Baixo volume  

---

### Média
- Impacto moderado  
- Volume significativo  

---

### Alta
- Alto impacto financeiro  
OU  
- Alto volume  

---

## 11.5 Parametrização

Os limites devem ser configuráveis, por exemplo:

- Baixa: até R$ X  
- Média: entre R$ X e R$ Y  
- Alta: acima de R$ Y  

---

## 11.6 Regras de Aplicação

- Alta materialidade aumenta prioridade  
- Baixa materialidade reduz necessidade de ação  
- Materialidade deve ser considerada junto com risco  

---

## 11.7 Uso no Sistema

Materialidade é utilizada para:

- Priorização de filas  
- Decisão de recuperação de tributos  
- Definição de esforço operacional  

---

## 11.8 Estratégia Operacional

- Foco em alto impacto financeiro  
- Evitar atuação em baixo retorno  
- Balancear risco vs custo  

---# 12. Saídas do Sistema (Relatórios e Alertas)

## 12.1 Objetivo

Definir os tipos de saída gerados pelo sistema para suporte à operação, análise e tomada de decisão.

---

## 12.2 Tipos de Saída

### 12.2.1 Relatórios Analíticos

Conteúdo:

- Lista de produtos com divergência  
- Score de confiança  
- Classificação de risco  
- Impacto financeiro estimado  
- Ação recomendada  

---

### 12.2.2 Painéis Gerenciais (Dashboards)

Indicadores:

- % de produtos com risco alto  
- Valor potencial de recuperação  
- Valor de risco fiscal  
- Top produtos críticos  
- Top fornecedores com divergência  

---

### 12.2.3 Filas de Trabalho

Listas priorizadas contendo:

- Itens críticos  
- Itens para revisão  
- Itens para correção  

Ordenação:

- Por risco  
- Por impacto financeiro  
- Por recorrência  

---

### 12.2.4 Alertas Automáticos

Tipos:

- Novo item com risco crítico  
- Aumento de recorrência  
- Divergência relevante detectada  
- Alteração de padrão de NCM  

---

### 12.2.5 Relatórios de Oportunidade

Conteúdo:

- Casos de pagamento a maior  
- Estimativa de valores recuperáveis  
- Priorização por valor  

---

### 12.2.6 Relatórios de Risco Fiscal

Conteúdo:

- Casos de pagamento a menor  
- Exposição fiscal estimada  
- Itens com ST inconsistente  

---

## 12.3 Frequência de Geração

- Em tempo real (alertas)  
- Diário (operações)  
- Mensal (gestão)  

---

## 12.4 Níveis de Usuário

Saídas podem ser adaptadas para:

- Operacional  
- Tático  
- Estratégico  

---

## 12.5 Exportação de Dados

- Exportação em formatos padrão (CSV, Excel, etc.)  
- Integração com outros sistemas  

---

## 12.6 Auditoria e Rastreabilidade

- Registro de todas as análises realizadas  
- Histórico de decisões  
- Log de alterações  
