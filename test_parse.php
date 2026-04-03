<?php
function parseExtInf(string $line): array
{
    $content = ltrim(substr($line, 8)); // remove #EXTINF:
    
    $duration = '-1';
    $title = '';
    $attributes = [];

    // Patrón para capturar la duración inicial y mantener el resto
    if (preg_match('/^([-\d\.]+)(.*)$/', $content, $matches)) {
        $duration = trim($matches[1]);
        $remainder = ltrim($matches[2]);
    } else {
        $remainder = $content;
    }

    $commaPos = false;
    $inQuotes = false;
    // Buscamos la coma delimitadora saltando las que estén entre comillas dobles
    for ($i = 0; $i < strlen($remainder); $i++) {
        $char = $remainder[$i];
        if ($char === '"') {
            $inQuotes = !$inQuotes;
        } elseif ($char === ',' && !$inQuotes) {
            $commaPos = $i;
            break;
        }
    }

    if ($commaPos === false) {
        return [
            'duration'   => $duration,
            'attributes' => [],
            'title'      => trim($remainder)
        ];
    }

    $attrString = trim(substr($remainder, 0, $commaPos));
    $title = trim(substr($remainder, $commaPos + 1));

    // Extraer atributos con comillas
    if (preg_match_all('/([a-zA-Z0-9_\-]+)\s*=\s*"([^"]*)"/', $attrString, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $attributes[$match[1]] = $match[2];
            // Remove matched part to not match as unquoted later
            $attrString = str_replace($match[0], '', $attrString);
        }
    }

    // Extraer atributos sin comillas (key=value)
    if (preg_match_all('/([a-zA-Z0-9_\-]+)\s*=\s*([^\s",]+)/', $attrString, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            if (!isset($attributes[$match[1]])) {
                $attributes[$match[1]] = $match[2];
            }
        }
    }

    return [
        'duration'   => $duration,
        'attributes' => $attributes,
        'title'      => $title,
    ];
}

$testLines = [
    '#EXTINF:-1 tvg-id="1" tvg-name="Foo, Bar",The Title, Has Commas',
    '#EXTINF:0,No Attributes, Just Commas',
    '#EXTINF:-1 tvg-logo="http://x.com/a.png",Channel 2',
    '#EXTINF:-1 group-title="Hola" tvg-name=SinComillas , Titulo Libre'
];

foreach ($testLines as $l) {
    print_r(parseExtInf($l));
}
