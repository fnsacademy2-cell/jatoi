with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the landing page section
start_pos = content.find('<!-- VIEW 0: LANDING PAGE')
end_pos = content.find('<!-- TAB 1: DASHBOARD OVERVIEW -->')
assert start_pos != -1 and end_pos != -1, "Could not find landing page section"

new_landing_section = """<!-- VIEW 0: LANDING PAGE (PORTAL SELECTION ON STARTUP) - CLEAN GLASSY LOOK -->
    <section id="view-landing" class="max-w-xl mx-auto py-8 sm:py-16 px-4 relative">
      
      <!-- Ambient Pastel Glow Orbs for Glass Reflection -->
      <div class="absolute -top-10 -left-10 w-60 h-60 bg-emerald-200/40 rounded-full blur-3xl pointer-events-none -z-10"></div>
      <div class="absolute top-1/2 -right-10 w-64 h-64 bg-blue-200/40 rounded-full blur-3xl pointer-events-none -z-10"></div>

      <!-- Main Title Only -->
      <div class="text-center mb-8 sm:mb-12">
        <h2 id="landingTitle" class="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
          Jatoi Fleet Fuel <span class="bg-gradient-to-r from-brand-600 via-emerald-600 to-teal-600 bg-clip-text text-transparent">MIS</span>
        </h2>
      </div>

      <!-- Two Clean Glassy Boxes: Admin and User (No Passwords Displayed) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 max-w-lg mx-auto">
        
        <!-- Box 1: Admin -->
        <button type="button" onclick="promptRoleLogin('admin')"
          class="glass-card-admin group rounded-3xl p-8 sm:p-10 text-center flex flex-col items-center justify-center gap-4 transition-all duration-300 active:scale-95 cursor-pointer relative overflow-hidden shadow-md hover:shadow-xl">
          
          <!-- Decorative Top Accent Gradient Line -->
          <div class="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-slate-700 via-slate-900 to-slate-700"></div>

          <!-- Glass Shimmer Highlight -->
          <div class="absolute -top-10 -right-10 w-28 h-28 bg-slate-200/40 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform duration-500"></div>

          <!-- Icon Box -->
          <div class="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white flex items-center justify-center text-4xl sm:text-5xl shadow-xl shadow-slate-900/25 group-hover:scale-105 transition-all">
            <i class="ph-bold ph-shield-check text-emerald-400"></i>
          </div>

          <!-- Role Title -->
          <span class="text-2xl sm:text-3xl font-extrabold text-slate-900 group-hover:text-brand-600 transition-colors" data-i18n="roleAdmin">
            Admin
          </span>
        </button>

        <!-- Box 2: User -->
        <button type="button" onclick="promptRoleLogin('user')"
          class="glass-card-user group rounded-3xl p-8 sm:p-10 text-center flex flex-col items-center justify-center gap-4 transition-all duration-300 active:scale-95 cursor-pointer relative overflow-hidden shadow-md hover:shadow-xl">
          
          <!-- Decorative Top Accent Gradient Line -->
          <div class="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-500 via-brand-500 to-teal-500"></div>

          <!-- Glass Shimmer Highlight -->
          <div class="absolute -top-10 -right-10 w-28 h-28 bg-emerald-200/50 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform duration-500"></div>

          <!-- Icon Box -->
          <div class="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-brand-600 to-emerald-600 text-white flex items-center justify-center text-4xl sm:text-5xl shadow-xl shadow-brand-500/25 group-hover:scale-105 transition-all">
            <i class="ph-bold ph-gas-pump"></i>
          </div>

          <!-- Role Title -->
          <span class="text-2xl sm:text-3xl font-extrabold text-slate-900 group-hover:text-emerald-600 transition-colors" data-i18n="roleUser">
            User
          </span>
        </button>

      </div>
    </section>

    """

content = content[:start_pos] + new_landing_section + content[end_pos:]

# Update applyTranslations to update landingTitle when switching languages
old_translations = """      if (lang === 'sd') {
        document.documentElement.dir = 'rtl';
        document.documentElement.lang = 'sd';
        document.body.classList.add('font-sindhi');
        if (brandElem) brandElem.innerHTML = 'جتوئي فليٽ فيول <span class="text-brand-600">ايم آءِ ايس</span>';
        document.title = 'جتوئي فليٽ فيول MIS - مئنيجمينٽ سسٽم';
        if (btnSd) btnSd.className = 'px-2.5 py-1.5 rounded-md transition text-brand-600 bg-brand-50 font-bold font-sindhi';
        if (btnEn) btnEn.className = 'px-2.5 py-1.5 rounded-md transition text-slate-600 hover:text-slate-900 font-bold';
      } else {
        document.documentElement.dir = 'ltr';
        document.documentElement.lang = 'en';
        document.body.classList.remove('font-sindhi');
        if (brandElem) brandElem.innerHTML = 'Jatoi Fleet Fuel <span class="text-brand-600">MIS</span>';
        document.title = 'Jatoi Fleet Fuel MIS - Fuel & Mileage Tracker';
        if (btnEn) btnEn.className = 'px-2.5 py-1.5 rounded-md transition text-brand-600 bg-brand-50 font-bold';
        if (btnSd) btnSd.className = 'px-2.5 py-1.5 rounded-md transition text-slate-600 hover:text-slate-900 font-bold font-sindhi';
      }"""

new_translations = """      const landingTitleElem = document.getElementById('landingTitle');
      if (lang === 'sd') {
        document.documentElement.dir = 'rtl';
        document.documentElement.lang = 'sd';
        document.body.classList.add('font-sindhi');
        if (brandElem) brandElem.innerHTML = 'جتوئي فليٽ فيول <span class="text-brand-600">ايم آءِ ايس</span>';
        if (landingTitleElem) landingTitleElem.innerHTML = 'جتوئي فليٽ فيول <span class="text-brand-600">ايم آءِ ايس</span>';
        document.title = 'جتوئي فليٽ فيول MIS - مئنيجمينٽ سسٽم';
        if (btnSd) btnSd.className = 'px-2.5 py-1.5 rounded-md transition text-brand-600 bg-brand-50 font-bold font-sindhi';
        if (btnEn) btnEn.className = 'px-2.5 py-1.5 rounded-md transition text-slate-600 hover:text-slate-900 font-bold';
      } else {
        document.documentElement.dir = 'ltr';
        document.documentElement.lang = 'en';
        document.body.classList.remove('font-sindhi');
        if (brandElem) brandElem.innerHTML = 'Jatoi Fleet Fuel <span class="text-brand-600">MIS</span>';
        if (landingTitleElem) landingTitleElem.innerHTML = 'Jatoi Fleet Fuel <span class="bg-gradient-to-r from-brand-600 via-emerald-600 to-teal-600 bg-clip-text text-transparent">MIS</span>';
        document.title = 'Jatoi Fleet Fuel MIS - Fuel & Mileage Tracker';
        if (btnEn) btnEn.className = 'px-2.5 py-1.5 rounded-md transition text-brand-600 bg-brand-50 font-bold';
        if (btnSd) btnSd.className = 'px-2.5 py-1.5 rounded-md transition text-slate-600 hover:text-slate-900 font-bold font-sindhi';
      }"""

assert old_translations in content, "old_translations not found!"
content = content.replace(old_translations, new_translations, 1)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Landing page cleaned up perfectly!")

