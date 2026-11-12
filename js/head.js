// S'exécute avant l'affichage : active le mode JS et respecte « réduire les animations ».
(function(){var r=document.documentElement;r.classList.remove('no-js');r.classList.add('js');try{if(matchMedia('(prefers-reduced-motion: reduce)').matches)r.classList.add('rm')}catch(e){}})();

// Anti-iframe (clickjacking). GitHub Pages ne permet pas d'envoyer l'en-tête
// « frame-ancestors » / X-Frame-Options : la page se masque si elle est affichée
// dans un cadre d'un autre site. Sur le RPi, l'en-tête Caddy fait le vrai travail.
(function(){try{if(window.top!==window.self){document.documentElement.style.display='none';window.top.location=window.self.location.href}}catch(e){document.documentElement.style.display='none'}})();
