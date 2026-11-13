-> start

=== start ===
#title: TEST
#align: left
#screen
Primeira linha.
Segunda linha.

Terceira linha.
Quarta linha.

Quinta linha.
+ [Casos de espaçamento] -> spacing

=== spacing ===
#title: Espaçamento
#screen
Linhas consecutivas, sem margem adicional.
Esta linha deve ficar logo abaixo da anterior.

Uma linha vazia: próximo parágrafo.


Duas linhas vazias: próximo parágrafo.



Três linhas vazias: próximo parágrafo.
















Dezesseis linhas vazias: este texto continua acessível por rolagem.
#bg: image/background/reading-texture.png
#image: image/scene/village-square.jpg
+ [Cena longa] -> long_scene
+ [Voltar ao início] -> start

=== long_scene ===
#title: Cena longa
#align: center
#screen
Este texto longo serve para exercitar a quebra automática e a rolagem no quadro. Ele deve permanecer legível, sem sobreposição ou perda de linhas, tanto no Preview do Electron quanto no Web Export.

Este parágrafo começa após uma linha vazia. A narrativa deve continuar acessível ao leitor mesmo quando o espaço intencional excede a altura visível.

Este é um parágrafo adicional com bastante conteúdo para forçar a rolagem natural e verificar se as escolhas ficam alcançáveis após o texto.

Uma última linha antes das escolhas.
#bg: image/background/reading-texture.png
#image: image/scene/last-star.jpg
+ [Reiniciar] -> start
+ [Concluir história] -> ending
-> END

=== ending ===
#title: Fim
#screen
História concluída.
-> END
