// ============================================================
// Sessiz Ortak - Focus Library Articles (Turkish)
// ============================================================

export interface FocusArticle {
    id: string;
    emoji: string;
    title: string;
    summary: string;
    body: string;
    readTime: number; // minutes
    tags: string[];
}

export const FOCUS_ARTICLES: FocusArticle[] = [
    {
        id: 'pomodoro-teknigi',
        emoji: 'ğŸ…',
        title: 'Pomodoro Teknigi Nedir?',
        summary: '25 dakikalik odak bloklariyla verimliligi artirmanin kanitlanmis yöntemi.',
        readTime: 3,
        tags: ['temel', 'teknik'],
        body: `Pomodoro Teknigi, 1980'lerde Francesco Cirillo tarafindan gelistirilen bir zaman yönetimi yöntemidir. Adini mutfak zamanlayicisinin domates (pomodoro) seklinden alir.

**Nasil Çalisir?**

1. Yapacagin isi belirle
2. Zamanlayiciyi 25 dakikaya kur
3. Süre dolana kadar sadece o ise odaklan
4. 5 dakika mola ver
5. Her 4 pomodoro'dan sonra 15-30 dakika uzun mola ver

**Neden Ise Yarar?**

Beyin sürekli çalismak için tasarlanmamistir. 25 dakikalik bloklar, odaklanma kasini zorlamadan güçlendirir. Molalar beynin bilgiyi islemesine ve enerji toplamasina yardimci olur.

**Sessiz Ortak'ta Pomodoro**

Sessiz Ortak'ta 15, 25, 50 ve 90 dakikalik süre seçenekleri var. Yeni baslayanlar için 25 dakika ideal. Derin odak isteyenler 50 dakikayi, maraton çalisanlar 90 dakikayi tercih edebilir.`,
    },
    {
        id: 'body-doubling',
        emoji: 'ğŸ‘¥',
        title: 'Body Doubling: Sessiz Eslik',
        summary: 'Yaninda biri varken neden daha iyi çalisirsin? Bilimin açiklamasi.',
        readTime: 4,
        tags: ['temel', 'bilim'],
        body: `Body doubling, baska birinin fiziksel (veya sanal) varliginin motivasyonu ve odaklanmayi artirdigi bir tekniktir. Özellikle ADHD'li bireyler için etkili oldugu kanitlanmistir, ama herkes için ise yarar.

**Neden Ise Yarar?**

- **Sosyal sorumluluk**: Biri seni "görüyor" oldugunda, ise baslamak ve devam etmek daha kolay.
- **Ayna nöronlari**: Çalisan birini görmek, beyninde benzer aktivite yaratir.
- **Azaltilmis izolasyon**: Yalniz çalismak yorucu olabilir. Sessiz bir eslik bile fark yaratir.

**Kamera Yok, Mikrofon Yok**

Sessiz Ortak'ta kimse seni görmez veya duymaz. Sadece birinin seninle ayni anda çalistigini bilirsin. Bu minimal baglanti bile odaklanmayi %30'a kadar artirabilir.

**Arastirma Ne Diyor?**

2019 yilinda yapilan bir çalisma, sanal body doubling'in yüz yüze kadar etkili oldugunu gösterdi. Önemli olan fiziksel yakinlik degil, "birlikte yapiyoruz" hissidir.`,
    },
    {
        id: 'odaklanma-ortami',
        emoji: 'ğŸ ',
        title: 'Odaklanma Ortami Nasil Yaratilir?',
        summary: 'Fiziksel ve dijital ortamini odak için optimize etmenin pratik yollari.',
        readTime: 3,
        tags: ['pratik', 'ortam'],
        body: `Odaklanma sadece zihinsel bir süreç degildir. Çevren, ne kadar iyi odaklanabildigini dogrudan etkiler.

**Fiziksel Ortam**

- **Masa**: Sadece çalisacagin seyleri masada birak. Daginiklik = dikkat daginikligi.
- **Isik**: Dogal isik en iyisi. Yoksa, sicak-beyaz masa lambasi kullan.
- **Sicaklik**: 20-22°C ideal. Çok sicak = uyusukluk, çok soguk = rahatsizlik.
- **Ses**: Tamamen sessiz ortam herkes için iyi degildir. Lo-fi müzik veya beyaz gürültü dene.

**Dijital Ortam**

- **Bildirimler**: Çalisma süresince tüm bildirimleri kapat.
- **Tek sekme**: Tarayicida sadece çalistigin seyle ilgili sekmeler açik olsun.
- **Telefon**: Baska odaya koy veya uçak moduna al.
- **Uygulama engelleyiciler**: Forest, Freedom gibi uygulamalar dikkat dagitici siteleri engelleyebilir.

**Ritüel Gücü**

Her çalisma seansindan önce ayni ritüeli yapmak (su iç, derin nefes al, hedef belirle) beynine "simdi odaklanma zamani" sinyali gönderir. Sessiz Ortak'taki ritüel adimi tam da bunu yapar.`,
    },
    {
        id: 'derin-odak',
        emoji: 'ğŸ§ ',
        title: 'Derin Odak vs. Yüzeysel Çalisma',
        summary: 'Cal Newport\'un derin is kavrami ve günlük hayata uygulamasi.',
        readTime: 4,
        tags: ['bilim', 'teori'],
        body: `Cal Newport'un "Deep Work" (Derin Is) kavrami, dikkat dagiticilardan uzak, yogun odaklanma gerektiren bilissel aktiviteleri tanimlar.

**Derin Is vs. Yüzeysel Is**

- **Derin Is**: Yeni bir sey ögrenmek, karmasik problem çözmek, yaratici üretim yapmak.
- **Yüzeysel Is**: E-posta yanitlamak, toplantilara katilmak, sosyal medya kontrol etmek.

**Neden Önemli?**

Derin is, en degerli çiktilari üretir. Ama modern dünya yüzeysel ise sürükler. Ortalama bir bilgi isçisi günde sadece 1-2 saat derin odaklanir.

**Derin Odak Nasil Gelistirilir?**

1. **Zamanlama**: Her gün ayni saatte derin çalisma blogu ayir.
2. **Ritüel**: Baslamadan önce ritüel olustur (Sessiz Ortak bunu otomatik yapar).
3. **Süre**: 25 dakikayla basla, zamanla 50-90 dakikaya çik.
4. **Tekrar**: Derin odak bir kas gibidir â€” düzenli antrenmanla güçlenir.
5. **Sikicilik toleransi**: Sikildiginda hemen telefona uzanma. Sikiciliga dayanmak derin odak kasini gelistirir.

**Sessiz Ortak + Derin Odak**

Sessiz Ortak, derin odak için ideal kosullari saglar: zamanlayici, ritüel, sessiz eslik ve dikkat dagiticilardan uzaklik.`,
    },
    {
        id: 'stres-odaklanma',
        emoji: 'ğŸ˜®â€ğŸ’¨',
        title: 'Stresin Odaklanmaya Etkisi',
        summary: 'Stres neden odaklanmayi zorlastirir ve bununla nasil basa çikilir.',
        readTime: 3,
        tags: ['bilim', 'saglik'],
        body: `Stres, odaklanmanin en büyük düsmanidir. Ama neden?

**Beyin ve Stres**

Stres altinda amigdala (tehlike merkezi) aktiflesir ve prefrontal korteks (planlama, odaklanma merkezi) baskilanir. Bu "savas ya da kaç" tepkisi, hayatta kalmak için tasarlanmistir ama modern dünyada genellikle zararlidir.

**Stres Döngüsü**

Stres â†’ Odaklanamama â†’ Is birikir â†’ Daha fazla stres â†’ Daha az odaklanma...

**Döngüyü Kirmak**

1. **Nefes**: 4-7-8 teknigi (4 saniye nefes al, 7 saniye tut, 8 saniye ver). Parasempatik sinir sistemini aktiflestirir.
2. **Küçük basla**: Büyük görevleri 15 dakikalik parçalara böl.
3. **Hareket**: 5 dakikalik yürüyüs kortizol seviyesini düsürür.
4. **Yazma**: Endiselerini kagida dök. Beyin "saklama" modundan çikar.
5. **Birlikte çalis**: Body doubling stresi azaltir çünkü yalniz degilsin.

**Sessiz Ortak'ta Stres Yönetimi**

Ritüel adiminda nefes egzersizi, cooldown'da duygu farkindaligi â€” bunlar stres yönetimi araçlaridir. Atlamadan yap.`,
    },
    {
        id: 'ritueller-aliskanliklar',
        emoji: 'ğŸ§˜',
        title: 'Ritüeller ve Aliskanliklar',
        summary: 'Küçük ritüeller nasil güçlü aliskanliklara dönüsür.',
        readTime: 3,
        tags: ['pratik', 'aliskanlik'],
        body: `James Clear'in "Atomic Habits" (Atomik Aliskanliklar) kitabi, küçük degisimlerin büyük sonuçlar yarattigini gösterir. Ritüeller bunun anahtaridir.

**Ritüel vs. Aliskanlik**

- **Ritüel**: Bilinçli olarak yapilan, anlam yüklü tekrarlanan eylem.
- **Aliskanlik**: Otomatiklesmis davranis kalibi.

Ritüeller zamanla aliskanliklara dönüsür. Sessiz Ortak'taki seans ritüeli (nefes al, hedef belirle, basla) tam da bunu hedefler.

**Aliskanlik Döngüsü**

1. **Isaret**: Sessiz Ortak'i aç (tetikleyici).
2. **Istek**: Odaklanmak istiyorsun (motivasyon).
3. **Tepki**: Ritüeli yap, seansi baslat (eylem).
4. **Ödül**: XP kazan, streak artir, görev tamamla (tatmin).

**Pratik Ipuçlari**

- Her gün ayni saatte seans yap.
- Ritüeli asla atlama â€” 30 saniye bile olsa yap.
- Cooldown'u da atla: kapanis ritüeli, aliskanligi pekistirir.
- Streak'ini koru: ardisik günler aliskanligi güçlendirir.`,
    },
    {
        id: 'dijital-detoks',
        emoji: 'ğŸ“µ',
        title: 'Dijital Detoks Ipuçlari',
        summary: 'Ekran bagimliligini azaltmak için uygulanabilir stratejiler.',
        readTime: 3,
        tags: ['pratik', 'saglik'],
        body: `Ortalama bir insan günde 7+ saat ekrana bakar. Bu, odaklanma kapasitesini ciddi sekilde azaltir.

**Dijital Detoks Neden Gerekli?**

- Sürekli bildirimler dikkat süresini kisaltir.
- Sosyal medya dopamin döngüsü yaratir.
- Mavi isik uyku kalitesini bozar.
- Multitasking (çoklu görev) aslinda imkansizdir â€” beyin sadece hizla geçis yapar.

**Pratik Adimlar**

1. **Sabah rutini**: Uyaninca ilk 30 dakika telefona bakma.
2. **Bildirim temizligi**: Sadece gerçekten önemli uygulamalarin bildirimlerini aç.
3. **Ekran süresi siniri**: iOS/Android ekran süresi özelligini kullan.
4. **Gri tonlar**: Telefonunu gri tonlara çevir â€” renkli ekran daha bagimlilik yaratir.
5. **Sarj yeri**: Telefonu yatak odasinda degil, baska odada sarj et.
6. **Tek cihaz**: Çalisirken sadece bir cihaz kullan.

**Sessiz Ortak = Mini Detoks**

Her Sessiz Ortak seansi aslinda bir mini dijital detoks. 25 dakika telefondan uzak, odaklanmis zaman geçirmek bile fark yaratir. Bunu günde 2-3 kez yap.`,
    },
    {
        id: 'kucuk-adimlar',
        emoji: 'ğŸ‘£',
        title: 'Küçük Adimlarin Gücü',
        summary: 'Büyük hedeflere ulasmanin en etkili yolu: mikro adimlar.',
        readTime: 2,
        tags: ['motivasyon', 'temel'],
        body: `"Bin millik yolculuk tek bir adimla baslar." â€” Lao Tzu

**Neden Küçük Baslamalisin?**

Beyin büyük görevlerden korkar. "Tez yazacagim" dediginde beyin direnir. Ama "5 dakika not alacagim" dediginde direnç minimal.

**2 Dakika Kurali**

David Allen'in GTD sisteminden: Bir is 2 dakikadan kisa sürüyorsa hemen yap. Büyük isleri 2 dakikalik parçalara böl ve sadece ilk parçayla basla.

**Momentum Etkisi**

Bir kez basladiginda devam etmek kolaydir. Fizikteki atalet yasasi insanlar için de geçerli: hareketsiz cisim hareketsiz kalir, hareketli cisim hareketli kalir.

**Sessiz Ortak ve Küçük Adimlar**

- 15 dakikalik seans: en küçük adim.
- Ritüel: 30 saniyelik baslangiç.
- Streak: her gün tek seans bile yeter.

Mükemmellik degil, tutarlilik önemli. Her gün küçük bir adim, bir yilda devasa bir yol demektir.`,
    },
];

