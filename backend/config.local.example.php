<?php
// Copy this file to config.local.php (it is git-ignored) and fill in your details.
return [
    // MySQL
    'host' => '127.0.0.1',
    'port' => '3306',
    'name' => 'auragoal',
    'user' => 'root',
    'pass' => '',          // your MySQL password

    // Where the website lives. Reset-password emails link here.
    'app_url' => 'http://localhost:5173',

    // Email, used for "Forgot password". Remove this block (or leave host empty) and nothing is sent:
    // each message is written to storage/mail.log instead, which is handy while developing.
    //
    // Gmail example: turn on 2-step verification, create an "App password" at
    // https://myaccount.google.com/apppasswords and use that 16-character code as 'pass'.
    // 'smtp' => [
    //     'host'      => 'smtp.gmail.com',
    //     'port'      => 587,
    //     'secure'    => 'tls',                   // tls = port 587, ssl = port 465
    //     'user'      => 'you@gmail.com',
    //     'pass'      => 'your-16-character-app-password',
    //     'from'      => 'you@gmail.com',         // must be the same Gmail address
    //     'from_name' => 'AuraGoal',
    // ],
];
