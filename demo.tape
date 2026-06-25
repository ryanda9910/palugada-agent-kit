# VHS tape — records the kit demo to demo.gif. Run via: bash make-demo.sh
Output demo.gif

Set Shell "bash"
Set FontSize 20
Set Width 1080
Set Height 640
Set Padding 26
Set Theme "Dracula"
Set TypingSpeed 40ms

Hide
Type "clear" Enter
Show

Type "node dist/examples/demo.js"
Sleep 400ms
Enter

# let the self-driving demo play out (runs ~8s, paces itself) + a beat to read
Sleep 9s
