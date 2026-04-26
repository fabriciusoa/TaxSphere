# TaxSphere — Design System
**Estilo:** Synchro — autoridade fiscal + inteligência digital  
**Referência visual:** Split-panel (form esquerdo / brand direito), similar ao Mentis/Vercel

---

## Identidade

**Who:** Contador / analista fiscal brasileiro, abrindo o sistema cedo para checar conformidades.  
**Feel:** Autoridade precisa. Fria como um terminal Bloomberg, mas legível. Não genérico — institucional com inteligência.  
**Logo:** Cérebro bipartido (metade orgânico / metade circuito) em ciano elétrico sobre navy profundo. A metáfora é o produto: conhecimento fiscal humano + processamento digital.

---

## Tokens de cor

```css
/* Primitivos */
--navy:         #0a1628;   /* Surface base dark — navy federal profundo */
--navy-mid:     #0d1f3c;   /* Surface elevada dark */
--navy-light:   #0f2347;   /* Surface topo dark */
--cyan:         #00c8f0;   /* Accent brand — ciano do logo, botões, foco */
--cyan-glow:    rgba(0, 200, 240, 0.25);  /* Shadow de botão */
--cyan-dim:     rgba(0, 200, 240, 0.12);  /* Background de badge/icon */
--cyan-border:  rgba(0, 200, 240, 0.22);  /* Borda de badge/icon */

/* Superfícies light (painel form) */
--form-bg:      #FFFFFF;
--input-bg:     #F7F9FC;   /* Input levemente rebaixado — sinal de "escreva aqui" */

/* Texto */
--text-primary:  #1a2332;  /* Navy muito escuro — não preto puro */
--text-second:   #64748b;  /* Slate médio */
--text-muted:    rgba(100, 116, 139, 0.65);  /* Rodapé, metadados */

/* Bordas */
--border-base:   rgba(15, 30, 60, 0.11);
--border-hover:  rgba(15, 30, 60, 0.22);
--border-focus:  #00c8f0;
```

---

## Tipografia

**Família:** `"Inter", system-ui, sans-serif`  
**Por quê:** Precisão técnica sem ser fria. Tabular numbers nativos. Leitores de dados confiam nela.

| Nível       | size        | weight | tracking        | uso                        |
|-------------|-------------|--------|-----------------|----------------------------|
| Headline    | clamp(1.875rem, 3vw, 2.625rem) | 700 | -0.03em | Headline de brand panel |
| H page      | 1.5rem      | 700    | -0.025em        | "Acesse sua conta"         |
| Body        | 0.9375rem   | 400    | 0               | Parágrafos, labels         |
| Label small | 0.875rem    | 400    | 0               | Labels de input            |
| Caption     | 0.8125rem   | 500    | 0.005em         | Feature badges, links      |
| Micro       | 0.6875rem   | 400    | 0.01em          | Versão, rodapé             |

---

## Espaçamento

**Base unit:** 8px (múltiplos de 8 via MUI `sx` theme spacing)

| Contexto                  | valor     |
|---------------------------|-----------|
| Micro (gap de ícone)      | 4px (0.5) |
| Componente interno        | 8–12px    |
| Entre campos do form      | 16px (2)  |
| Seção (heading → form)    | 28px (3.5)|
| Major (logo → heading)    | 56px (7)  |
| Padding lateral painel    | 56px (7)  |

---

## Profundidade (Depth Strategy)

**Abordagem:** Subtle shadows — soft lift para o painel form. Borders para superfícies dark.  
**Regra:** Uma estratégia só. Não misturar.

- **Painel form (light):** sem sombra própria, elevação por contraste com painel dark
- **Inputs:** `background: #F7F9FC` + borda 1px base — recuo visual, sem sombra
- **Botão CTA:** `box-shadow: 0 4px 18px rgba(0,200,240,0.25)` — glow ciano sutil
- **Hover do botão:** `box-shadow: 0 6px 22px rgba(0,200,240,0.38)`
- **Cards (app):** `box-shadow: 0 1px 4px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.04)`

---

## Border Radius

| Elemento       | radius  |
|----------------|---------|
| Input / Button | 10px    |
| Badge / Icon   | 14px    |
| Card           | 12px    |
| Modal          | 16px    |
| Tag / Chip     | 6px     |

---

## Componentes documentados

### Split-panel layout (login / onboarding)
```
<Box sx={{ display: 'flex', minHeight: '100vh' }}>
  {/* LEFT: 38%, min 420px, branco, px:7, py:6 */}
  {/* RIGHT: flex:1, navy gradient, display none em xs */}
</Box>
```
- **Linha de acento topo:** `height:2, linear-gradient(90deg, cyan → transparent), opacity:0.5`
- **Textura circuito:** `radial-gradient(circle, rgba(0,200,240,0.13) 1px, transparent 1px), backgroundSize: 28px 28px`
- **Orb de glow:** `bottom:-15%, right:-8%, 560px, radial-gradient cyan → transparent`
- **Dots de progresso:** largura 28/8/8px, height 4px, borderRadius 2, ciano ativo / branco 18% inativo

### Input padrão (`inputSx`)
```tsx
{
  '& .MuiOutlinedInput-root': {
    backgroundColor: '#F7F9FC',
    borderRadius: '10px',
    '& fieldset': { borderColor: 'rgba(15,30,60,0.11)' },
    '&:hover fieldset': { borderColor: 'rgba(15,30,60,0.22)' },
    '&.Mui-focused fieldset': { borderColor: '#00c8f0', borderWidth: 1.5 },
  },
  '& .MuiInputLabel-root': { color: '#64748b', fontSize: '0.875rem' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#00c8f0' },
}
```
- Usar `slotProps` (não `InputProps` — deprecated no MUI v5+)

### Botão CTA primário
```tsx
sx={{
  height: 48,
  borderRadius: '10px',
  backgroundColor: '#00c8f0',
  color: '#0a1628',
  fontWeight: 700,
  textTransform: 'none',
  boxShadow: '0 4px 18px rgba(0,200,240,0.25)',
  '&:hover': { backgroundColor: '#00b8e0', boxShadow: '0 6px 22px rgba(0,200,240,0.38)' },
  '&.Mui-disabled': { backgroundColor: 'rgba(0,200,240,0.35)', color: '#0a1628' },
}}
```

### Feature badge
```tsx
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.875 }}>
  <CheckCircle sx={{ color: '#00c8f0', fontSize: 15 }} />
  <Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.8125rem', fontWeight: 500 }}>
    {label}
  </Typography>
</Box>
```

### Icon badge (brand panel)
```tsx
sx={{
  width: 56, height: 56, borderRadius: '14px',
  backgroundColor: 'rgba(0,200,240,0.12)',
  border: '1px solid rgba(0,200,240,0.22)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}}
```

---

## Paleta semântica (herdada do theme.ts)

| Token       | Valor     | Uso                         |
|-------------|-----------|-----------------------------|
| success     | #66BB6A   | CND ativa, status OK        |
| warning     | #FFA726   | Prazo próximo, pendente     |
| error       | #D32F2F   | CNPJ irregular, débito      |
| info        | #29B6F6   | Informativo neutro          |
| secondary   | #78BE20   | Verde fiscal (conformidade) |

---

## Regras gerais

1. **Ciano é o accent.** Não usar outra cor para CTA ou foco de input.
2. **Navy é o fundo de tudo que é "sistema/máquina".** Brand panel, headers em dark mode, badges de status.
3. **Branco documental** para o lado "humano" — formulários, leitura, inputs.
4. **Nunca misturar estratégias de profundidade** — shadow em light, border em dark.
5. **`slotProps`** sempre, não `InputProps` (MUI v5+).
6. **`textTransform: 'none'`** em todos os botões.
7. Ícones: MUI Icons exclusivamente. Sem misturar libraries.
