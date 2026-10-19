/** Ciel étoilé en décor, avec le tracé de la Lyre et Véga (NouvelOnglet.dc.html). */
export function Ciel() {
  return (
    <svg class="ciel-decor" aria-hidden="true" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
      <g fill="#FFFFFF">
        <circle cx="62" cy="48" r="1.4" opacity=".7" /><circle cx="140" cy="120" r="1" opacity=".5" /><circle cx="210" cy="40" r="1.8" opacity=".8" /><circle cx="300" cy="90" r="1" opacity=".45" /><circle cx="380" cy="30" r="1.3" opacity=".6" /><circle cx="470" cy="70" r="1" opacity=".4" /><circle cx="560" cy="25" r="1.6" opacity=".7" /><circle cx="640" cy="110" r="1" opacity=".5" /><circle cx="730" cy="50" r="1.2" opacity=".55" /><circle cx="830" cy="95" r="1.9" opacity=".85" /><circle cx="920" cy="35" r="1" opacity=".5" /><circle cx="970" cy="140" r="1.3" opacity=".6" />
        <circle cx="40" cy="220" r="1" opacity=".4" /><circle cx="120" cy="300" r="1.5" opacity=".65" /><circle cx="260" cy="250" r="1" opacity=".45" /><circle cx="330" cy="330" r="1.2" opacity=".5" /><circle cx="90" cy="420" r="1.7" opacity=".75" /><circle cx="200" cy="520" r="1" opacity=".4" /><circle cx="420" cy="560" r="1.4" opacity=".6" /><circle cx="540" cy="470" r="1" opacity=".45" /><circle cx="660" cy="540" r="1.6" opacity=".7" /><circle cx="760" cy="440" r="1" opacity=".5" /><circle cx="880" cy="520" r="1.3" opacity=".6" /><circle cx="960" cy="400" r="1" opacity=".45" /><circle cx="700" cy="300" r="1" opacity=".4" /><circle cx="610" cy="200" r="1.2" opacity=".5" />
      </g>
      <g stroke="#5A5AA8" stroke-width="1" fill="none" opacity=".7">
        <path d="M840 190 L812 250 L858 262 L840 190" /><path d="M812 250 L784 355" /><path d="M858 262 L836 372" /><path d="M784 355 L836 372" />
      </g>
      <g fill="#DADAF8">
        <circle cx="840" cy="190" r="4.5" /><circle cx="812" cy="250" r="2.2" /><circle cx="858" cy="262" r="2.2" /><circle cx="784" cy="355" r="2.6" /><circle cx="836" cy="372" r="2.6" />
      </g>
      <text x="852" y="186" fill="#9A9AD0" font-size="12" font-family="Manrope, system-ui, sans-serif">Véga</text>
    </svg>
  )
}
