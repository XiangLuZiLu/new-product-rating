
(function(){
  function fixUrl(url){
    return String(url || '').replace(
      /^http:\/\/xianglu\.dragon-sturgeon\.cn/i,
      'https://xianglu.dragon-sturgeon.cn'
    );
  }

  const mask = document.createElement('div');
  mask.className = 'product-image-viewer-mask';
  mask.innerHTML = '<div class="product-image-viewer-box"><img class="product-image-viewer-img"></div>';
  document.body.appendChild(mask);

  const img = mask.querySelector('.product-image-viewer-img');

  function closeViewer(){
    mask.classList.remove('show');
    img.removeAttribute('src');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }

  document.addEventListener('click', function(e){

    const target = e.target.closest('[data-preview-image]');

    if(target && !mask.classList.contains('show')){
      e.stopPropagation();

      img.src = fixUrl(target.dataset.previewImage || target.src);
      mask.classList.add('show');

      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      return;
    }

  }, true);


  // 点击任意位置恢复页面
  mask.addEventListener('click', function(){
    closeViewer();
  });


  // 防止点击图片时出现其他行为，但仍然关闭
  img.addEventListener('click', function(e){
    e.stopPropagation();
    closeViewer();
  });


  document.addEventListener('keydown',function(e){
    if(e.key === 'Escape'){
      closeViewer();
    }
  });

})();
