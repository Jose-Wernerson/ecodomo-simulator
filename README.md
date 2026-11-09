# EcoDomo Simulator

Simulador interativo de uma **biosfera em cúpula**: uma estufa de vidro hemisférica que produz água doce, gera a própria energia e mantém uma ilha de vegetação, tudo a partir de um reservatório de água salgada e da luz do Sol.

Roda no navegador, com visualização 3D em tempo real, gráficos e um motor físico que roda sem interface (e por isso pode ser testado de forma automática).

**[Ver o simulador online](https://ecodomo-simulator.vercel.app)**

> Os resultados são estimativas de um modelo físico simplificado. Servem para explorar ideias e comparar cenários, não para dimensionar uma obra real.

## O que é a EcoDomo

A ideia combina quatro sistemas num só ambiente fechado:

1. **Dessalinização solar.** O Sol aquece o reservatório salino dentro da cúpula. A água evapora, condensa no vidro mais frio, escorre e é coletada como água doce.
2. **Resfriamento externo.** Uma bacia de água bombeada sobre o vidro mantém a cúpula fria, o que aumenta a condensação.
3. **Cobertura giratória.** Uma cobertura gira sobre a cúpula e controla a quantidade de luz que entra, regulando a temperatura interna.
4. **Ilha de vegetação.** Parte da água doce produzida é usada para irrigar o solo da ilha. Painéis fotovoltaicos e uma bateria alimentam bombas, motor e sensores.

O simulador acompanha o balanço de água, energia elétrica e calor ao longo dos dias, e mostra se a vegetação, a temperatura e a umidade ficam dentro de uma faixa viável.

## Cenários comparados

| Cenário | Resfriamento externo | Cobertura giratória |
| --- | --- | --- |
| Sem resfriamento externo | não | não |
| Com resfriamento externo | sim | não |
| Com cobertura giratória | não | sim |
| Sistema integrado | sim | sim |

Cada cenário pode ser executado em lote (vários dias simulados de uma vez) para comparar produção de água doce, consumo de energia, temperatura média, margem do ponto de orvalho e saúde da vegetação.

## Recursos

- Cena 3D da cúpula, da ilha, do reservatório e da cobertura (Three.js).
- Painel de controle com parâmetros de clima, geometria, energia, resfriamento, cobertura e solo.
- Indicadores em tempo real e gráficos do histórico.
- Análise comparativa entre os quatro cenários.
- Verificação de **conservação** de água, eletricidade e calor a cada simulação.

## Como rodar

Requisitos: Node.js 18 ou superior.

```bash
npm install
npm run dev              # servidor de desenvolvimento
npm test                 # conservação de água, energia e regras científicas
npm run build            # build de produção (Vite)
npm run build:artifact   # página única em dist-artifact/ecodomo.html, com bibliotecas via CDN
```

## Testes

`npm test` roda os quatro cenários por 7 dias simulados e confere:

- fechamento do balanço de água, de eletricidade e de calor;
- que sem Sol não há geração nem recarga da bateria;
- que a bateria nunca fica negativa;
- que o motor da cobertura para quando falta energia.

Se um teste falhar, o modelo está criando ou perdendo massa ou energia, e a correção deve ser no motor, não no teste.

## Estrutura

```
src/
  engine/
    params.ts      parâmetros configuráveis, constantes físicas e geometria
    physics.ts     motor físico, sem dependência de interface
    scenarios.ts   os quatro cenários e a execução em lote
    sim.ts         relógio em tempo real e histórico
  scene/
    DomeScene.ts   visualização 3D
  ui/              painel, indicadores, gráficos e análises (React)
tests/
  engine.test.ts   testes de conservação e regras científicas
scripts/
  build-artifact.mjs   gera a página única
```

## Como estender

Para adicionar um mecanismo novo:

1. inclua os parâmetros em `src/engine/params.ts`;
2. implemente os fluxos em `step()`, em `src/engine/physics.ts`;
3. registre as entradas e saídas no livro contábil de energia, para que `npm test` continue validando a conservação.

As constantes físicas ficam todas em `K`, em `params.ts`, o que facilita calibrar o modelo com dados reais.

## Tecnologias

React 18, TypeScript, Three.js, Vite e esbuild. Testes com tsx.

## Limitações

O modelo usa balanços de massa e energia agregados (sem CFD, sem variação espacial fina do vidro). Ele é pensado para comparar cenários e entender ordens de grandeza.

## Licença

Defina uma licença antes de publicar para uso por terceiros (por exemplo MIT).
