import fs from 'node:fs/promises';
import path from 'node:path';

// Run with the first-party Artifact Session or @oai/artifact-tool runtime.
export async function buildDeck(presentation, root) {
  const C={bg:'#F7F9F2',green:'#183E2D',muted:'#78886A',lime:'#D2EE9A',line:'#DFE6D5'};
  presentation.theme.defaultFont='Arial';
  function slide(title,number,subtitle=''){
    const s=presentation.slides.add({width:1280,height:720,background:{fill:C.bg}});
    if(title)text(s,title,64,48,1152,74,43,true);
    if(subtitle)text(s,subtitle,66,128,1130,56,23,false,C.muted);
    text(s,'Лекторий',64,676,200,23,14,true,C.muted);
    text(s,String(number).padStart(2,'0'),1160,676,56,23,14,false,C.muted);
    return s;
  }
  function text(s,value,x,y,w,h,size=25,bold=false,color=C.green){
    const t=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
    t.text=value;t.text.style={fontSize:size,bold,color,typeface:'Arial'};return t;
  }
  async function pic(s,file,x,y,w,h,fit='contain'){
    const data=await fs.readFile(path.join(root,file));
    s.images.add({blob:new Uint8Array(data),contentType:file.endsWith('.webp')?'image/webp':'image/jpeg',alt:file,fit,position:{left:x,top:y,width:w,height:h}});
  }
  let s=slide('',1);
  await pic(s,'frontend/public/art/hero.webp',530,0,750,720,'cover');
  text(s,'Лекторий',64,146,660,100,84,true);
  text(s,'Смысловой поиск\nпо видеолекциям',68,272,530,142,43,false);
  text(s,'От вопроса своими словами\nк нужной секунде видео',69,463,470,87,27,false,C.muted);
  text(s,'Киберрывок 2026',69,608,400,35,23,false,C.muted);
  s.speakerNotes.text='Работающий прототип в репозитории https://github.com/aerade/product2. Все скриншоты сняты с локального приложения. Иллюстрации созданы встроенным imagegen. Видео демо озвучены синтетическим голосом и помечены как демонстрационные.';

  s=slide('Нужный момент в длинной лекции',2);
  text(s,'«Где это\nобъясняли?»',66,188,615,190,63,false);
  text(s,'При повторном просмотре нужно\nвспомнить формулировку и найти\nнужное место на временной шкале.',69,419,560,135,28,false,C.muted);
  await pic(s,'frontend/public/art/math.webp',690,185,526,410,'cover');
  s.speakerNotes.text='Описание пользовательского сценария из plan_videolectures.md. Это формулировка проблемы, а не количественная оценка аудитории.';

  s=slide('Каталог с поиском по смыслу',3,'Одна точка входа для курсов, лекций и вопросов');
  await pic(s,'docs/screenshots/catalog-top.jpg',405,200,811,442,'contain');
  text(s,'Спросить\nсвоими словами',66,236,320,112,37,true);
  text(s,'Выбрать курс\nи продолжить\nизучение',68,421,302,150,28,false,C.muted);
  s.speakerNotes.text='Реальный экран каталога. На проверочной установке четыре локальные мини-лекции и одна импортированная YouTube-лекция. При новом seed доступны только четыре собственных демо-видео.';

  s=slide('Запрос своими словами',4,'Система сопоставляет смысл вопроса и транскрипта');
  text(s,'Как найти длину\nдиагонали комнаты?',66,217,410,155,38,true);
  text(s,'Результат: 0:53',68,415,400,55,35,true);
  text(s,'Нажатие открывает\nвидео с этой секунды.',69,494,370,95,25,false,C.muted);
  await pic(s,'docs/screenshots/search-top.jpg',500,194,716,447,'contain');
  s.speakerNotes.text='Проверено на реальной multilingual-e5-small ONNX. Первый результат demo-pythagoras, start_seconds=53.95. Это единичная функциональная проверка, не измерение качества на бенчмарке.';

  s=slide('Видео и текст работают вместе',5,'Транскрипт, оглавление и термины ведут к нужному моменту');
  await pic(s,'docs/screenshots/lecture-top.jpg',66,197,1150,440,'contain');
  s.speakerNotes.text='В браузере подтверждён currentTime=53.95 после перехода из поиска. Подсветка строки следует за воспроизведением, отдельный переключатель отключает автопрокрутку. Для YouTube проверены воспроизведение и переход к 9:08 через официальный IFrame API.';

  s=slide('Ответ с опорой на источник',6);
  text(s,'Диагональ комнаты\n3 × 4 метра\nравна 5 метрам.',68,187,680,178,43,true);
  text(s,'В ответе есть подтверждающий\nфрагмент лекции на 0:53.',69,423,630,95,29,false,C.muted);
  text(s,'Если данных в лекции нет,\nсистема сообщает об этом.',69,552,630,75,24,false,C.muted);
  await pic(s,'docs/screenshots/answer-detail.jpg',827,165,363,477,'contain');
  s.speakerNotes.text='Реальный запрос к подключённому серверному API AI STAR, модель claude-haiku-4-5. Ключ хранится только в локальном .env и не входит в презентацию или репозиторий. Вопрос о выпечке хлеба получил mode=insufficient. Генерация может ошибаться, поэтому ссылки на источник остаются доступными.';

  s=slide('Личная библиотека моментов',7,'Закладки и заметки сохраняют контекст');
  await pic(s,'docs/screenshots/library-top.jpg',438,198,778,443,'contain');
  text(s,'Мысль + таймкод',68,236,340,96,37,true);
  text(s,'Вернуться в видео\nиз личной заметки.\nИзменить или удалить\nсохранённую мысль.',69,389,337,190,27,false,C.muted);
  s.speakerNotes.text='Скриншот созданной заметки зрителя на 53.95 секунде. API проверяет владельца каждой заметки и закладки. Администратор не получает доступ к чужим личным заметкам.';

  s=slide('Три роли и серверные права',8);
  const roles=[['Зритель','Смотрит и ищет.\nСохраняет личные заметки.\nПредлагает новые видео.'],['Преподаватель','Добавляет видео и ссылки.\nСледит за обработкой.\nУправляет своими лекциями.'],['Администратор','Назначает роли.\nРассматривает предложения.\nУправляет всеми лекциями.']];
  roles.forEach(([role,body],i)=>{text(s,role,66+i*385,210,350,70,34,true);text(s,body,69+i*385,319,348,190,25,false,C.muted);});
  text(s,'Каждый запрос проверяет роль и владельца на сервере.',69,572,1120,55,28,true);
  s.speakerNotes.text='Новая регистрация всегда viewer. Первый admin создаётся отдельной CLI-командой. Отдельные проверки запрещают viewer загружать, teacher менять чужие лекции и любому пользователю менять чужую заметку. Повторное одобрение ссылки идемпотентно.';

  s=slide('Архитектура обработки',9);
  const boxes=[['React + TypeScript','Плеер и интерфейс'],['FastAPI','Сессии и права'],['SQLite + worker','Очередь и данные']];
  boxes.forEach(([label,detail],i)=>{const x=66+i*397;s.shapes.add({geometry:'rect',position:{left:x,top:210,width:350,height:126},fill:'#E7EEDD',line:{fill:'#D5E0C6',width:1}});text(s,label,x+20,231,313,48,31,true);text(s,detail,x+20,285,310,32,22,false,C.muted);if(i<2)s.shapes.add({geometry:'rightArrow',position:{left:x+357,top:256,width:32,height:25},fill:'#8AA96A',line:{fill:'none',width:0}});});
  text(s,'Видео или ссылка',68,404,350,50,29,true);
  text(s,'FFmpeg и Whisper\nполучают речь с таймкодами.',69,476,350,105,24,false,C.muted);
  text(s,'Смысловой индекс',465,404,350,50,29,true);
  text(s,'Multilingual E5 ONNX\nсравнивает запрос и фрагменты.',466,476,350,105,24,false,C.muted);
  text(s,'Материалы лекции',862,404,350,50,29,true);
  text(s,'Серверный API генерирует\nконспект и ответы с источниками.',863,476,350,105,24,false,C.muted);
  s.speakerNotes.text='Очередь хранится в SQLite, worker использует lease и heartbeat. Файлы локальны. Эмбеддинги исполняются на CPU и хранятся как float32. Модель речи faster-whisper base. Генерация подключается через переменные окружения. При большом каталоге нужен переход на PostgreSQL и векторную БД.';

  s=slide('Проверка работающего прототипа',10);
  text(s,'34',67,177,270,141,106,true);
  text(s,'автоматические проверки',70,326,530,52,28,true);
  text(s,'Реально проверены распознавание\nвидео без субтитров, импорт YouTube,\nпоиск и ответы через подключённый API.',70,421,650,141,27,false,C.muted);
  text(s,'github.com/aerade/product2',70,598,720,47,28,true);
  await pic(s,'frontend/public/art/library.webp',777,187,439,330,'cover');
  text(s,'Ограничение сети:\nVimeo вернул HTTP 403.\nДоступен путь загрузки файла.',793,552,400,85,21,false,C.muted);
  s.speakerNotes.text='34 pytest прошли на Windows, production build React/TypeScript прошёл. Реальное распознавание 20-секундного ролика дало 4 сегмента, YouTube aircAruvnKk импортирован с 286 сегментами. Проверены широкий и мобильный интерфейсы, вход viewer, закладка и личная заметка. Docker-конфигурация подготовлена, контейнерный запуск не проверен в этой среде. Источник результатов: docs/verification.md.';
  return presentation;
}
