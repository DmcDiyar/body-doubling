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
        emoji: '🍅',
        title: 'Pomodoro Tekniği Nedir?',
        summary: '25 dakikalık odak bloklarıyla verimliliği artırmanın kanıtlanmış yöntemi.',
        readTime: 3,
        tags: ['temel', 'teknik'],
        body: `Pomodoro Tekniği, 1980'lerde Francesco Cirillo tarafından geliştirilen bir zaman yönetimi yöntemidir. Adını mutfak zamanlayıcısının domates (pomodoro) şeklinden alır.

**Nasıl Çalışır?**

1. Yapacağın işi belirle
2. Zamanlayıcıyı 25 dakikaya kur
3. Süre dolana kadar sadece o işe odaklan
4. 5 dakika mola ver
5. Her 4 pomodoro'dan sonra 15-30 dakika uzun mola ver

**Neden İşe Yarar?**

Beyin sürekli çalışmak için tasarlanmamıştır. 25 dakikalık bloklar, odaklanma kasını zorlamadan güçlendirir. Molalar beynin bilgiyi işlemesine ve enerji toplamasına yardımcı olur.

**Sessiz Ortak'ta Pomodoro**

Sessiz Ortak'ta 15, 25, 50 ve 90 dakikalık süre seçenekleri var. Yeni başlayanlar için 25 dakika ideal. Derin odak isteyenler 50 dakikayı, maraton çalışanlar 90 dakikayı tercih edebilir.`,
    },
    {
        id: 'body-doubling',
        emoji: '👥',
        title: 'Body Doubling: Sessiz Eşlik',
        summary: 'Yanında biri varken neden daha iyi çalışırsın? Bilimin açıklaması.',
        readTime: 4,
        tags: ['temel', 'bilim'],
        body: `Body doubling, başka birinin fiziksel (veya sanal) varlığının motivasyonu ve odaklanmayı artırdığı bir tekniktir. Özellikle ADHD'li bireyler için etkili olduğu kanıtlanmıştır, ama herkes için işe yarar.

**Neden İşe Yarar?**

- **Sosyal sorumluluk**: Biri seni "görüyor" olduğunda, işe başlamak ve devam etmek daha kolay.
- **Ayna nöronları**: Çalışan birini görmek, beyninde benzer aktivite yaratır.
- **Azaltılmış izolasyon**: Yalnız çalışmak yorucu olabilir. Sessiz bir eşlik bile fark yaratır.

**Kamera Yok, Mikrofon Yok**

Sessiz Ortak'ta kimse seni görmez veya duymaz. Sadece birinin seninle aynı anda çalıştığını bilirsin. Bu minimal bağlantı bile odaklanmayı %30'a kadar artırabilir.

**Araştırma Ne Diyor?**

2019 yılında yapılan bir çalışma, sanal body doubling'in yüz yüze kadar etkili olduğunu gösterdi. Önemli olan fiziksel yakınlık değil, "birlikte yapıyoruz" hissidir.`,
    },
    {
        id: 'odaklanma-ortami',
        emoji: '🏠',
        title: 'Odaklanma Ortamı Nasıl Yaratılır?',
        summary: 'Fiziksel ve dijital ortamını odak için optimize etmenin pratik yolları.',
        readTime: 3,
        tags: ['pratik', 'ortam'],
        body: `Odaklanma sadece zihinsel bir süreç değildir. Çevren, ne kadar iyi odaklanabildiğini doğrudan etkiler.

**Fiziksel Ortam**

- **Masa**: Sadece çalışacağın şeyleri masada bırak. Dağınıklık = dikkat dağınıklığı.
- **Işık**: Doğal ışık en iyisi. Yoksa, sıcak-beyaz masa lambası kullan.
- **Sıcaklık**: 20-22°C ideal. Çok sıcak = uyuşukluk, çok soğuk = rahatsızlık.
- **Ses**: Tamamen sessiz ortam herkes için iyi değildir. Lo-fi müzik veya beyaz gürültü dene.

**Dijital Ortam**

- **Bildirimler**: Çalışma süresince tüm bildirimleri kapat.
- **Tek sekme**: Tarayıcıda sadece çalıştığın şeyle ilgili sekmeler açık olsun.
- **Telefon**: Başka odaya koy veya uçak moduna al.
- **Uygulama engelleyiciler**: Forest, Freedom gibi uygulamalar dikkat dağıtıcı siteleri engelleyebilir.

**Ritüel Gücü**

Her çalışma seansından önce aynı ritüeli yapmak (su iç, derin nefes al, hedef belirle) beynine "şimdi odaklanma zamanı" sinyali gönderir. Sessiz Ortak'taki ritüel adımı tam da bunu yapar.`,
    },
    {
        id: 'derin-odak',
        emoji: '🧠',
        title: 'Derin Odak vs. Yüzeysel Çalışma',
        summary: 'Cal Newport\'un derin iş kavramı ve günlük hayata uygulaması.',
        readTime: 4,
        tags: ['bilim', 'teori'],
        body: `Cal Newport'un "Deep Work" (Derin İş) kavramı, dikkat dağıtıcılardan uzak, yoğun odaklanma gerektiren bilişsel aktiviteleri tanımlar.

**Derin İş vs. Yüzeysel İş**

- **Derin İş**: Yeni bir şey öğrenmek, karmaşık problem çözmek, yaratıcı üretim yapmak.
- **Yüzeysel İş**: E-posta yanıtlamak, toplantılara katılmak, sosyal medya kontrol etmek.

**Neden Önemli?**

Derin iş, en değerli çıktıları üretir. Ama modern dünya yüzeysel işe sürükler. Ortalama bir bilgi işçisi günde sadece 1-2 saat derin odaklanır.

**Derin Odak Nasıl Geliştirilir?**

1. **Zamanlama**: Her gün aynı saatte derin çalışma bloğu ayır.
2. **Ritüel**: Başlamadan önce ritüel oluştur (Sessiz Ortak bunu otomatik yapar).
3. **Süre**: 25 dakikayla başla, zamanla 50-90 dakikaya çık.
4. **Tekrar**: Derin odak bir kas gibidir — düzenli antrenmanla güçlenir.
5. **Sıkıcılık toleransı**: Sıkıldığında hemen telefona uzanma. Sıkıcılığa dayanmak derin odak kasını geliştirir.

**Sessiz Ortak + Derin Odak**

Sessiz Ortak, derin odak için ideal koşulları sağlar: zamanlayıcı, ritüel, sessiz eşlik ve dikkat dağıtıcılardan uzaklık.`,
    },
    {
        id: 'stres-odaklanma',
        emoji: '😮‍💨',
        title: 'Stresin Odaklanmaya Etkisi',
        summary: 'Stres neden odaklanmayı zorlaştırır ve bununla nasıl başa çıkılır.',
        readTime: 3,
        tags: ['bilim', 'sağlık'],
        body: `Stres, odaklanmanın en büyük düşmanıdır. Ama neden?

**Beyin ve Stres**

Stres altında amigdala (tehlike merkezi) aktifleşir ve prefrontal korteks (planlama, odaklanma merkezi) baskılanır. Bu "savaş ya da kaç" tepkisi, hayatta kalmak için tasarlanmıştır ama modern dünyada genellikle zararlıdır.

**Stres Döngüsü**

Stres → Odaklanamama → İş birikir → Daha fazla stres → Daha az odaklanma...

**Döngüyü Kırmak**

1. **Nefes**: 4-7-8 tekniği (4 saniye nefes al, 7 saniye tut, 8 saniye ver). Parasempatik sinir sistemini aktifleştirir.
2. **Küçük başla**: Büyük görevleri 15 dakikalık parçalara böl.
3. **Hareket**: 5 dakikalık yürüyüş kortizol seviyesini düşürür.
4. **Yazma**: Endişelerini kağıda dök. Beyin "saklama" modundan çıkar.
5. **Birlikte çalış**: Body doubling stresi azaltır çünkü yalnız değilsin.

**Sessiz Ortak'ta Stres Yönetimi**

Ritüel adımında nefes egzersizi, cooldown'da duygu farkındalığı — bunlar stres yönetimi araçlarıdır. Atlamadan yap.`,
    },
    {
        id: 'ritueller-aliskanliklar',
        emoji: '🧘',
        title: 'Ritüeller ve Alışkanlıklar',
        summary: 'Küçük ritüeller nasıl güçlü alışkanlıklara dönüşür.',
        readTime: 3,
        tags: ['pratik', 'alışkanlık'],
        body: `James Clear'ın "Atomic Habits" (Atomik Alışkanlıklar) kitabı, küçük değişimlerin büyük sonuçlar yarattığını gösterir. Ritüeller bunun anahtarıdır.

**Ritüel vs. Alışkanlık**

- **Ritüel**: Bilinçli olarak yapılan, anlam yüklü tekrarlanan eylem.
- **Alışkanlık**: Otomatikleşmiş davranış kalıbı.

Ritüeller zamanla alışkanlıklara dönüşür. Sessiz Ortak'taki seans ritüeli (nefes al, hedef belirle, başla) tam da bunu hedefler.

**Alışkanlık Döngüsü**

1. **İşaret**: Sessiz Ortak'ı aç (tetikleyici).
2. **İstek**: Odaklanmak istiyorsun (motivasyon).
3. **Tepki**: Ritüeli yap, seansı başlat (eylem).
4. **Ödül**: XP kazan, streak artır, görev tamamla (tatmin).

**Pratik İpuçları**

- Her gün aynı saatte seans yap.
- Ritüeli asla atlama — 30 saniye bile olsa yap.
- Cooldown'u da atla: kapanış ritüeli, alışkanlığı pekiştirir.
- Streak'ini koru: ardışık günler alışkanlığı güçlendirir.`,
    },
    {
        id: 'dijital-detoks',
        emoji: '📵',
        title: 'Dijital Detoks İpuçları',
        summary: 'Ekran bağımlılığını azaltmak için uygulanabilir stratejiler.',
        readTime: 3,
        tags: ['pratik', 'sağlık'],
        body: `Ortalama bir insan günde 7+ saat ekrana bakar. Bu, odaklanma kapasitesini ciddi şekilde azaltır.

**Dijital Detoks Neden Gerekli?**

- Sürekli bildirimler dikkat süresini kısaltır.
- Sosyal medya dopamin döngüsü yaratır.
- Mavi ışık uyku kalitesini bozar.
- Multitasking (çoklu görev) aslında imkansızdır — beyin sadece hızla geçiş yapar.

**Pratik Adımlar**

1. **Sabah rutini**: Uyanınca ilk 30 dakika telefona bakma.
2. **Bildirim temizliği**: Sadece gerçekten önemli uygulamaların bildirimlerini aç.
3. **Ekran süresi sınırı**: iOS/Android ekran süresi özelliğini kullan.
4. **Gri tonlar**: Telefonunu gri tonlara çevir — renkli ekran daha bağımlılık yaratır.
5. **Şarj yeri**: Telefonu yatak odasında değil, başka odada şarj et.
6. **Tek cihaz**: Çalışırken sadece bir cihaz kullan.

**Sessiz Ortak = Mini Detoks**

Her Sessiz Ortak seansı aslında bir mini dijital detoks. 25 dakika telefondan uzak, odaklanmış zaman geçirmek bile fark yaratır. Bunu günde 2-3 kez yap.`,
    },
    {
        id: 'kucuk-adimlar',
        emoji: '👣',
        title: 'Küçük Adımların Gücü',
        summary: 'Büyük hedeflere ulaşmanın en etkili yolu: mikro adımlar.',
        readTime: 2,
        tags: ['motivasyon', 'temel'],
        body: `"Bin millik yolculuk tek bir adımla başlar." — Lao Tzu

**Neden Küçük Başlamalısın?**

Beyin büyük görevlerden korkar. "Tez yazacağım" dediğinde beyin direnir. Ama "5 dakika not alacağım" dediğinde direnç minimal.

**2 Dakika Kuralı**

David Allen'ın GTD sisteminden: Bir iş 2 dakikadan kısa sürüyorsa hemen yap. Büyük işleri 2 dakikalık parçalara böl ve sadece ilk parçayla başla.

**Momentum Etkisi**

Bir kez başladığında devam etmek kolaydır. Fizikteki atalet yasası insanlar için de geçerli: hareketsiz cisim hareketsiz kalır, hareketli cisim hareketli kalır.

**Sessiz Ortak ve Küçük Adımlar**

- 15 dakikalık seans: en küçük adım.
- Ritüel: 30 saniyelik başlangıç.
- Streak: her gün tek seans bile yeter.

Mükemmellik değil, tutarlılık önemli. Her gün küçük bir adım, bir yılda devasa bir yol demektir.`,
    },
];
