# Feliz aniversário, Renata! 🎂

Página comemorativa para a professora Renata Piacentini Rodriguez: um biodigestor produz bolhas de CH₄; cada bolha estourada revela uma mensagem e enche o gasômetro. Com todo o metano coletado, a válvula se abre, o biometano corre pela tubulação e acende a vela do bolo.

## Como editar as mensagens

As mensagens ficam em `index.html`, na lista `<ol id="amostras">`. Cada `<li class="amostra">` vira uma bolha de CH₄: copie um item, troque o número da etiqueta (R-08, R-09…) e o texto. O laudo final fica logo abaixo, em `<article id="laudo">`.

Sem JavaScript a página mostra todas as mensagens e a vela acesa.

## Estrutura

- `index.html`: fluxograma em SVG (R-101 biodigestor, V-102 válvula, PI-103 gasômetro, B-201 bolo) e as mensagens
- `tokens.css`: paleta e tipografia (papel de engenharia, tinta azul-petróleo, a chama como único ponto quente)
- `base.css` e `style.css`: estilos, conferidos com o linter do [Hallmark](https://github.com/Nutlope/hallmark) e a lista do [unslop](https://github.com/heydamir/unslop) (CC BY 4.0, Damir Sokolovsky)
- `script.js`: bolhas, rótulos, som sintetizado (Web Audio) e confete
- `.github/workflows/pages.yml`: deploy automático no GitHub Pages a cada push na `main`

Sem dependências nem etapa de build. Para testar localmente: `python -m http.server` e abrir `http://localhost:8000`.
