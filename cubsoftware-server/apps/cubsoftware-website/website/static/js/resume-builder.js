// Resume Builder JavaScript

// State
let currentDocType = 'resume';
let currentTemplate = 'modern';
let currentBackground = 'clean';
let currentFont = 'georgia';
let currentColor = 'blue';
let skills = [];
let experiences = [];
let education = [];
let certifications = [];
let projects = [];
let languages = [];
let awards = [];
let editingId = null;

// Elements
const docTabs = document.querySelectorAll('.doc-tab');
const resumeForm = document.getElementById('resumeForm');
const coverLetterForm = document.getElementById('coverLetterForm');
const templateSelect = document.getElementById('templateSelect');
const backgroundSelect = document.getElementById('backgroundSelect');
const fontSelect = document.getElementById('fontSelect');
const colorSelect = document.getElementById('colorSelect');
const resumePreview = document.getElementById('resumePreview');
const savedList = document.getElementById('savedList');

// Initialize
function init() {
    setupEventListeners();
    setupCustomDropdowns();
    loadSavedDocuments();
    updatePreview();

    // Set default date for cover letter
    document.getElementById('clDate').value = new Date().toISOString().split('T')[0];
}

// Setup custom dropdowns
function setupCustomDropdowns() {
    const dropdowns = document.querySelectorAll('.custom-dropdown');

    dropdowns.forEach(dropdown => {
        const toggle = dropdown.querySelector('.dropdown-toggle');
        const menu = dropdown.querySelector('.dropdown-menu');
        const items = dropdown.querySelectorAll('.dropdown-item');
        const label = dropdown.querySelector('.dropdown-label');
        const colorIndicator = dropdown.querySelector('.color-indicator');
        const targetId = dropdown.dataset.target;
        const hiddenSelect = document.getElementById(targetId);

        // Toggle dropdown on click
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns
            dropdowns.forEach(d => {
                if (d !== dropdown) d.classList.remove('open');
            });
            dropdown.classList.toggle('open');
        });

        // Handle item selection
        items.forEach(item => {
            item.addEventListener('click', () => {
                const value = item.dataset.value;
                const text = item.textContent.trim();

                // Update label
                if (targetId === 'colorSelect') {
                    // For color, show just the color name
                    label.textContent = text;
                    // Update color indicator
                    const colorDot = item.querySelector('.color-dot');
                    if (colorIndicator && colorDot) {
                        colorIndicator.style.background = colorDot.style.background;
                    }
                } else {
                    label.textContent = text;
                }

                // Update active state
                items.forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                // Update hidden select and trigger change
                if (hiddenSelect) {
                    hiddenSelect.value = value;
                    hiddenSelect.dispatchEvent(new Event('change'));
                }

                // Close dropdown
                dropdown.classList.remove('open');
            });
        });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', () => {
        dropdowns.forEach(d => d.classList.remove('open'));
    });

    // Close dropdowns on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dropdowns.forEach(d => d.classList.remove('open'));
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    // Document type tabs
    docTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            docTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentDocType = tab.dataset.type;
            toggleForms();
            updatePreview();
        });
    });

    // Template select
    templateSelect.addEventListener('change', () => {
        currentTemplate = templateSelect.value;
        updatePreview();
    });

    // Background select
    if (backgroundSelect) {
        backgroundSelect.addEventListener('change', () => {
            currentBackground = backgroundSelect.value;
            updatePreview();
        });
    }

    // Font select
    if (fontSelect) {
        fontSelect.addEventListener('change', () => {
            currentFont = fontSelect.value;
            updatePreview();
        });
    }

    // Color select
    if (colorSelect) {
        colorSelect.addEventListener('change', () => {
            currentColor = colorSelect.value;
            updatePreview();
        });
    }

    // Form inputs - update preview on change
    document.querySelectorAll('#resumeForm input, #resumeForm textarea').forEach(input => {
        input.addEventListener('input', updatePreview);
    });

    document.querySelectorAll('#coverLetterForm input, #coverLetterForm textarea').forEach(input => {
        input.addEventListener('input', updatePreview);
    });

    // Skills input
    const skillsInput = document.getElementById('skillsInput');
    skillsInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const skill = skillsInput.value.trim();
            if (skill && !skills.includes(skill)) {
                skills.push(skill);
                renderSkills();
                updatePreview();
            }
            skillsInput.value = '';
        }
    });

    // Add experience
    document.getElementById('addExperience').addEventListener('click', () => {
        experiences.push({
            id: Date.now(),
            title: '',
            company: '',
            location: '',
            startDate: '',
            endDate: '',
            description: ''
        });
        renderExperiences();
    });

    // Add education
    document.getElementById('addEducation').addEventListener('click', () => {
        education.push({
            id: Date.now(),
            degree: '',
            school: '',
            location: '',
            graduationDate: '',
            description: ''
        });
        renderEducation();
    });

    // Add certification
    document.getElementById('addCertification').addEventListener('click', () => {
        certifications.push({
            id: Date.now(),
            name: '',
            issuer: '',
            date: '',
            credentialId: ''
        });
        renderCertifications();
    });

    // Add project
    document.getElementById('addProject').addEventListener('click', () => {
        projects.push({
            id: Date.now(),
            name: '',
            description: '',
            technologies: '',
            link: ''
        });
        renderProjects();
    });

    // Add language
    document.getElementById('addLanguage').addEventListener('click', () => {
        languages.push({
            id: Date.now(),
            language: '',
            proficiency: 'Fluent'
        });
        renderLanguages();
    });

    // Add award
    document.getElementById('addAward').addEventListener('click', () => {
        awards.push({
            id: Date.now(),
            title: '',
            issuer: '',
            date: '',
            description: ''
        });
        renderAwards();
    });

    // Save draft
    document.getElementById('saveDraftBtn').addEventListener('click', saveDraft);

    // Download PDF
    document.getElementById('downloadPdfBtn').addEventListener('click', downloadPdf);

    // Clear all
    document.getElementById('clearAllBtn').addEventListener('click', () => {
        if (confirm('Delete all saved documents?')) {
            localStorage.removeItem('savedDocuments');
            loadSavedDocuments();
            showToast('All documents deleted');
        }
    });

    // Share link button
    document.getElementById('shareLinkBtn').addEventListener('click', shareResume);

    // Copy share URL button
    document.getElementById('copyShareBtn').addEventListener('click', async () => {
        const input = document.getElementById('shareUrlInput');
        const url = input.value;
        try {
            await navigator.clipboard.writeText(url);
            showToast('Link copied to clipboard!');
        } catch (err) {
            // Fallback for older browsers
            input.select();
            document.execCommand('copy');
            showToast('Link copied to clipboard!');
        }
    });
}

// Toggle forms
function toggleForms() {
    if (currentDocType === 'cover-letter') {
        resumeForm.style.display = 'none';
        coverLetterForm.style.display = 'block';
    } else {
        resumeForm.style.display = 'block';
        coverLetterForm.style.display = 'none';
    }
}

// Render skills
function renderSkills() {
    const container = document.getElementById('skillsTags');
    container.innerHTML = skills.map((skill, index) => `
        <span class="tag">
            ${escapeHtml(skill)}
            <button class="remove-tag" onclick="removeSkill(${index})">×</button>
        </span>
    `).join('');
}

// Remove skill
window.removeSkill = function(index) {
    skills.splice(index, 1);
    renderSkills();
    updatePreview();
};

// Render experiences
function renderExperiences() {
    const container = document.getElementById('experienceList');
    container.innerHTML = experiences.map((exp, index) => `
        <div class="dynamic-item">
            <button class="remove-btn" onclick="removeExperience(${index})">×</button>
            <div class="form-row">
                <div class="form-group">
                    <label>Job Title</label>
                    <input type="text" value="${escapeHtml(exp.title)}" onchange="updateExperience(${index}, 'title', this.value)">
                </div>
                <div class="form-group">
                    <label>Company</label>
                    <input type="text" value="${escapeHtml(exp.company)}" onchange="updateExperience(${index}, 'company', this.value)">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Start Date</label>
                    <input type="text" placeholder="Jan 2020" value="${escapeHtml(exp.startDate)}" onchange="updateExperience(${index}, 'startDate', this.value)">
                </div>
                <div class="form-group">
                    <label>End Date</label>
                    <input type="text" placeholder="Present" value="${escapeHtml(exp.endDate)}" onchange="updateExperience(${index}, 'endDate', this.value)">
                </div>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea rows="3" onchange="updateExperience(${index}, 'description', this.value)">${escapeHtml(exp.description)}</textarea>
            </div>
        </div>
    `).join('');
}

// Update experience
window.updateExperience = function(index, field, value) {
    experiences[index][field] = value;
    updatePreview();
};

// Remove experience
window.removeExperience = function(index) {
    experiences.splice(index, 1);
    renderExperiences();
    updatePreview();
};

// Render education
function renderEducation() {
    const container = document.getElementById('educationList');
    container.innerHTML = education.map((edu, index) => `
        <div class="dynamic-item">
            <button class="remove-btn" onclick="removeEducation(${index})">×</button>
            <div class="form-row">
                <div class="form-group">
                    <label>Degree</label>
                    <input type="text" value="${escapeHtml(edu.degree)}" onchange="updateEducation(${index}, 'degree', this.value)">
                </div>
                <div class="form-group">
                    <label>School</label>
                    <input type="text" value="${escapeHtml(edu.school)}" onchange="updateEducation(${index}, 'school', this.value)">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Location</label>
                    <input type="text" value="${escapeHtml(edu.location)}" onchange="updateEducation(${index}, 'location', this.value)">
                </div>
                <div class="form-group">
                    <label>Graduation Date</label>
                    <input type="text" placeholder="May 2020" value="${escapeHtml(edu.graduationDate)}" onchange="updateEducation(${index}, 'graduationDate', this.value)">
                </div>
            </div>
        </div>
    `).join('');
}

// Update education
window.updateEducation = function(index, field, value) {
    education[index][field] = value;
    updatePreview();
};

// Remove education
window.removeEducation = function(index) {
    education.splice(index, 1);
    renderEducation();
    updatePreview();
};

// Render certifications
function renderCertifications() {
    const container = document.getElementById('certificationList');
    container.innerHTML = certifications.map((cert, index) => `
        <div class="dynamic-item">
            <button class="remove-btn" onclick="removeCertification(${index})">×</button>
            <div class="form-row">
                <div class="form-group">
                    <label>Certification Name</label>
                    <input type="text" value="${escapeHtml(cert.name)}" onchange="updateCertification(${index}, 'name', this.value)">
                </div>
                <div class="form-group">
                    <label>Issuing Organization</label>
                    <input type="text" value="${escapeHtml(cert.issuer)}" onchange="updateCertification(${index}, 'issuer', this.value)">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Date Obtained</label>
                    <input type="text" placeholder="Jan 2023" value="${escapeHtml(cert.date)}" onchange="updateCertification(${index}, 'date', this.value)">
                </div>
                <div class="form-group">
                    <label>Credential ID (Optional)</label>
                    <input type="text" value="${escapeHtml(cert.credentialId)}" onchange="updateCertification(${index}, 'credentialId', this.value)">
                </div>
            </div>
        </div>
    `).join('');
}

window.updateCertification = function(index, field, value) {
    certifications[index][field] = value;
    updatePreview();
};

window.removeCertification = function(index) {
    certifications.splice(index, 1);
    renderCertifications();
    updatePreview();
};

// Render projects
function renderProjects() {
    const container = document.getElementById('projectList');
    container.innerHTML = projects.map((proj, index) => `
        <div class="dynamic-item">
            <button class="remove-btn" onclick="removeProject(${index})">×</button>
            <div class="form-row">
                <div class="form-group">
                    <label>Project Name</label>
                    <input type="text" value="${escapeHtml(proj.name)}" onchange="updateProject(${index}, 'name', this.value)">
                </div>
                <div class="form-group">
                    <label>Technologies Used</label>
                    <input type="text" placeholder="React, Node.js, etc." value="${escapeHtml(proj.technologies)}" onchange="updateProject(${index}, 'technologies', this.value)">
                </div>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea rows="2" onchange="updateProject(${index}, 'description', this.value)">${escapeHtml(proj.description)}</textarea>
            </div>
            <div class="form-group">
                <label>Project Link (Optional)</label>
                <input type="url" placeholder="https://..." value="${escapeHtml(proj.link)}" onchange="updateProject(${index}, 'link', this.value)">
            </div>
        </div>
    `).join('');
}

window.updateProject = function(index, field, value) {
    projects[index][field] = value;
    updatePreview();
};

window.removeProject = function(index) {
    projects.splice(index, 1);
    renderProjects();
    updatePreview();
};

// Render languages
function renderLanguages() {
    const container = document.getElementById('languageList');
    container.innerHTML = languages.map((lang, index) => `
        <div class="dynamic-item">
            <button class="remove-btn" onclick="removeLanguage(${index})">×</button>
            <div class="form-row">
                <div class="form-group">
                    <label>Language</label>
                    <input type="text" value="${escapeHtml(lang.language)}" onchange="updateLanguage(${index}, 'language', this.value)">
                </div>
                <div class="form-group">
                    <label>Proficiency</label>
                    <select onchange="updateLanguage(${index}, 'proficiency', this.value)">
                        <option value="Native" ${lang.proficiency === 'Native' ? 'selected' : ''}>Native</option>
                        <option value="Fluent" ${lang.proficiency === 'Fluent' ? 'selected' : ''}>Fluent</option>
                        <option value="Advanced" ${lang.proficiency === 'Advanced' ? 'selected' : ''}>Advanced</option>
                        <option value="Intermediate" ${lang.proficiency === 'Intermediate' ? 'selected' : ''}>Intermediate</option>
                        <option value="Basic" ${lang.proficiency === 'Basic' ? 'selected' : ''}>Basic</option>
                    </select>
                </div>
            </div>
        </div>
    `).join('');
}

window.updateLanguage = function(index, field, value) {
    languages[index][field] = value;
    updatePreview();
};

window.removeLanguage = function(index) {
    languages.splice(index, 1);
    renderLanguages();
    updatePreview();
};

// Render awards
function renderAwards() {
    const container = document.getElementById('awardList');
    container.innerHTML = awards.map((award, index) => `
        <div class="dynamic-item">
            <button class="remove-btn" onclick="removeAward(${index})">×</button>
            <div class="form-row">
                <div class="form-group">
                    <label>Award/Achievement Title</label>
                    <input type="text" value="${escapeHtml(award.title)}" onchange="updateAward(${index}, 'title', this.value)">
                </div>
                <div class="form-group">
                    <label>Issuer/Organization</label>
                    <input type="text" value="${escapeHtml(award.issuer)}" onchange="updateAward(${index}, 'issuer', this.value)">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Date</label>
                    <input type="text" placeholder="2023" value="${escapeHtml(award.date)}" onchange="updateAward(${index}, 'date', this.value)">
                </div>
                <div class="form-group">
                    <label>Description (Optional)</label>
                    <input type="text" value="${escapeHtml(award.description)}" onchange="updateAward(${index}, 'description', this.value)">
                </div>
            </div>
        </div>
    `).join('');
}

window.updateAward = function(index, field, value) {
    awards[index][field] = value;
    updatePreview();
};

window.removeAward = function(index) {
    awards.splice(index, 1);
    renderAwards();
    updatePreview();
};

// Update preview
function updatePreview() {
    if (currentDocType === 'cover-letter') {
        updateCoverLetterPreview();
    } else {
        updateResumePreview();
    }
}

// Update resume preview
function updateResumePreview() {
    const fullName = document.getElementById('fullName').value || 'Your Name';
    const jobTitle = document.getElementById('jobTitle').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const location = document.getElementById('location').value;
    const website = document.getElementById('website').value;
    const summary = document.getElementById('summary').value;

    let contactHtml = '';
    if (email) contactHtml += `<span>${escapeHtml(email)}</span>`;
    if (phone) contactHtml += `<span>${escapeHtml(phone)}</span>`;
    if (location) contactHtml += `<span>${escapeHtml(location)}</span>`;
    if (website) contactHtml += `<span>${escapeHtml(website)}</span>`;

    let html = `
        <div class="preview-name">${escapeHtml(fullName)}</div>
        ${jobTitle ? `<div class="preview-title">${escapeHtml(jobTitle)}</div>` : ''}
        <div class="preview-contact">${contactHtml}</div>
    `;

    if (summary) {
        html += `
            <div class="section-title">Professional Summary</div>
            <div class="preview-summary">${escapeHtml(summary)}</div>
        `;
    }

    if (experiences.length > 0) {
        html += `<div class="section-title">Experience</div>`;
        experiences.forEach(exp => {
            if (exp.title || exp.company) {
                html += `
                    <div class="preview-item">
                        <div class="preview-item-header">
                            <span class="preview-item-title">${escapeHtml(exp.title)}</span>
                            <span class="preview-item-date">${escapeHtml(exp.startDate)}${exp.endDate ? ' - ' + escapeHtml(exp.endDate) : ''}</span>
                        </div>
                        <div class="preview-item-subtitle">${escapeHtml(exp.company)}</div>
                        ${exp.description ? `<div class="preview-item-description">${escapeHtml(exp.description)}</div>` : ''}
                    </div>
                `;
            }
        });
    }

    if (education.length > 0) {
        html += `<div class="section-title">Education</div>`;
        education.forEach(edu => {
            if (edu.degree || edu.school) {
                html += `
                    <div class="preview-item">
                        <div class="preview-item-header">
                            <span class="preview-item-title">${escapeHtml(edu.degree)}</span>
                            <span class="preview-item-date">${escapeHtml(edu.graduationDate)}</span>
                        </div>
                        <div class="preview-item-subtitle">${escapeHtml(edu.school)}${edu.location ? ', ' + escapeHtml(edu.location) : ''}</div>
                    </div>
                `;
            }
        });
    }

    if (skills.length > 0) {
        html += `
            <div class="section-title">Skills</div>
            <div class="preview-skills">
                ${skills.map(skill => `<span class="preview-skill">${escapeHtml(skill)}</span>`).join('')}
            </div>
        `;
    }

    if (certifications.length > 0) {
        html += `<div class="section-title">Certifications</div>`;
        certifications.forEach(cert => {
            if (cert.name) {
                html += `
                    <div class="preview-item">
                        <div class="preview-item-header">
                            <span class="preview-item-title">${escapeHtml(cert.name)}</span>
                            <span class="preview-item-date">${escapeHtml(cert.date)}</span>
                        </div>
                        <div class="preview-item-subtitle">${escapeHtml(cert.issuer)}${cert.credentialId ? ' • ID: ' + escapeHtml(cert.credentialId) : ''}</div>
                    </div>
                `;
            }
        });
    }

    if (projects.length > 0) {
        html += `<div class="section-title">Projects</div>`;
        projects.forEach(proj => {
            if (proj.name) {
                html += `
                    <div class="preview-item">
                        <div class="preview-item-header">
                            <span class="preview-item-title">${escapeHtml(proj.name)}</span>
                            ${proj.technologies ? `<span class="preview-item-date">${escapeHtml(proj.technologies)}</span>` : ''}
                        </div>
                        ${proj.description ? `<div class="preview-item-description">${escapeHtml(proj.description)}</div>` : ''}
                        ${proj.link ? `<div class="preview-item-link">${escapeHtml(proj.link)}</div>` : ''}
                    </div>
                `;
            }
        });
    }

    if (languages.length > 0) {
        html += `
            <div class="section-title">Languages</div>
            <div class="preview-languages">
                ${languages.map(lang => lang.language ? `<span class="preview-language">${escapeHtml(lang.language)} <em>(${escapeHtml(lang.proficiency)})</em></span>` : '').join('')}
            </div>
        `;
    }

    if (awards.length > 0) {
        html += `<div class="section-title">Awards & Achievements</div>`;
        awards.forEach(award => {
            if (award.title) {
                html += `
                    <div class="preview-item">
                        <div class="preview-item-header">
                            <span class="preview-item-title">${escapeHtml(award.title)}</span>
                            <span class="preview-item-date">${escapeHtml(award.date)}</span>
                        </div>
                        <div class="preview-item-subtitle">${escapeHtml(award.issuer)}</div>
                        ${award.description ? `<div class="preview-item-description">${escapeHtml(award.description)}</div>` : ''}
                    </div>
                `;
            }
        });
    }

    resumePreview.innerHTML = html;
    resumePreview.className = `resume-preview template-${currentTemplate} bg-${currentBackground} font-${currentFont} color-${currentColor}`;
}

// Update cover letter preview
function updateCoverLetterPreview() {
    const name = document.getElementById('clName').value || 'Your Name';
    const email = document.getElementById('clEmail').value;
    const phone = document.getElementById('clPhone').value;
    const date = document.getElementById('clDate').value;
    const recipient = document.getElementById('clRecipient').value;
    const company = document.getElementById('clCompany').value;
    const address = document.getElementById('clAddress').value;
    const position = document.getElementById('clPosition').value;
    const opening = document.getElementById('clOpening').value;
    const body = document.getElementById('clBody').value;
    const closing = document.getElementById('clClosing').value;

    const formattedDate = date ? new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

    let html = `
        <div class="cover-letter-preview">
            <div class="letter-header">
                <div>${escapeHtml(name)}</div>
                ${email ? `<div>${escapeHtml(email)}</div>` : ''}
                ${phone ? `<div>${escapeHtml(phone)}</div>` : ''}
            </div>

            ${formattedDate ? `<div class="letter-date">${formattedDate}</div>` : ''}

            <div class="letter-recipient">
                ${recipient ? `<div>${escapeHtml(recipient)}</div>` : ''}
                ${company ? `<div>${escapeHtml(company)}</div>` : ''}
                ${address ? `<div>${escapeHtml(address)}</div>` : ''}
            </div>

            <div class="letter-greeting">Dear ${recipient ? escapeHtml(recipient) : 'Hiring Manager'},</div>

            <div class="letter-body">
                ${opening ? `<p>${escapeHtml(opening)}</p>` : ''}
                ${body ? `<p>${escapeHtml(body)}</p>` : ''}
                ${closing ? `<p>${escapeHtml(closing)}</p>` : ''}
            </div>

            <div class="letter-closing">Sincerely,</div>
            <div class="letter-signature">${escapeHtml(name)}</div>
        </div>
    `;

    resumePreview.innerHTML = html;
    resumePreview.className = `resume-preview bg-${currentBackground}`;
}

// Save draft
function saveDraft() {
    const data = collectFormData();

    if (!data.fullName && !data.clName) {
        showToast('Please enter a name');
        return;
    }

    const saved = JSON.parse(localStorage.getItem('savedDocuments') || '[]');

    const doc = {
        id: editingId || Date.now(),
        type: currentDocType,
        template: currentTemplate,
        background: currentBackground,
        font: currentFont,
        color: currentColor,
        data: data,
        updatedAt: Date.now()
    };

    if (editingId) {
        const index = saved.findIndex(d => d.id === editingId);
        if (index !== -1) {
            saved[index] = doc;
        }
        editingId = null;
    } else {
        saved.unshift(doc);
    }

    localStorage.setItem('savedDocuments', JSON.stringify(saved));
    loadSavedDocuments();
    showToast('Document saved!');
}

// Collect form data
function collectFormData() {
    if (currentDocType === 'cover-letter') {
        return {
            clName: document.getElementById('clName').value,
            clEmail: document.getElementById('clEmail').value,
            clPhone: document.getElementById('clPhone').value,
            clDate: document.getElementById('clDate').value,
            clRecipient: document.getElementById('clRecipient').value,
            clCompany: document.getElementById('clCompany').value,
            clAddress: document.getElementById('clAddress').value,
            clPosition: document.getElementById('clPosition').value,
            clOpening: document.getElementById('clOpening').value,
            clBody: document.getElementById('clBody').value,
            clClosing: document.getElementById('clClosing').value
        };
    } else {
        return {
            fullName: document.getElementById('fullName').value,
            jobTitle: document.getElementById('jobTitle').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            location: document.getElementById('location').value,
            website: document.getElementById('website').value,
            summary: document.getElementById('summary').value,
            experiences: [...experiences],
            education: [...education],
            skills: [...skills],
            certifications: [...certifications],
            projects: [...projects],
            languages: [...languages],
            awards: [...awards]
        };
    }
}

// Load saved documents
function loadSavedDocuments() {
    const saved = JSON.parse(localStorage.getItem('savedDocuments') || '[]');

    if (saved.length === 0) {
        savedList.innerHTML = '<div class="empty-state">No saved documents yet</div>';
        return;
    }

    savedList.innerHTML = saved.map(doc => {
        const name = doc.data.fullName || doc.data.clName || 'Untitled';
        const date = new Date(doc.updatedAt).toLocaleDateString();
        const typeLabel = doc.type === 'cover-letter' ? 'Cover Letter' : doc.type.toUpperCase();

        return `
            <div class="saved-item">
                <div class="saved-item-header">
                    <span class="saved-item-title">${escapeHtml(name)}</span>
                    <span class="saved-item-type">${typeLabel}</span>
                </div>
                <div class="saved-item-date">Last edited: ${date}</div>
                <div class="saved-item-actions">
                    <button onclick="loadDocument(${doc.id})">Edit</button>
                    <button class="delete-btn" onclick="deleteDocument(${doc.id})">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

// Load document for editing
window.loadDocument = function(id) {
    const saved = JSON.parse(localStorage.getItem('savedDocuments') || '[]');
    const doc = saved.find(d => d.id === id);

    if (!doc) return;

    editingId = id;
    currentDocType = doc.type;
    currentTemplate = doc.template || 'modern';
    currentBackground = doc.background || 'clean';
    currentFont = doc.font || 'georgia';
    currentColor = doc.color || 'blue';

    // Update UI
    docTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.type === currentDocType);
    });
    templateSelect.value = currentTemplate;
    if (backgroundSelect) backgroundSelect.value = currentBackground;
    if (fontSelect) fontSelect.value = currentFont;
    if (colorSelect) colorSelect.value = currentColor;
    toggleForms();

    // Load data into form
    if (currentDocType === 'cover-letter') {
        Object.keys(doc.data).forEach(key => {
            const el = document.getElementById(key);
            if (el) el.value = doc.data[key] || '';
        });
    } else {
        document.getElementById('fullName').value = doc.data.fullName || '';
        document.getElementById('jobTitle').value = doc.data.jobTitle || '';
        document.getElementById('email').value = doc.data.email || '';
        document.getElementById('phone').value = doc.data.phone || '';
        document.getElementById('location').value = doc.data.location || '';
        document.getElementById('website').value = doc.data.website || '';
        document.getElementById('summary').value = doc.data.summary || '';

        experiences = doc.data.experiences || [];
        education = doc.data.education || [];
        skills = doc.data.skills || [];
        certifications = doc.data.certifications || [];
        projects = doc.data.projects || [];
        languages = doc.data.languages || [];
        awards = doc.data.awards || [];

        renderExperiences();
        renderEducation();
        renderSkills();
        renderCertifications();
        renderProjects();
        renderLanguages();
        renderAwards();
    }

    updatePreview();
    showToast('Document loaded!');

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Delete document
window.deleteDocument = function(id) {
    if (!confirm('Delete this document?')) return;

    let saved = JSON.parse(localStorage.getItem('savedDocuments') || '[]');
    saved = saved.filter(d => d.id !== id);
    localStorage.setItem('savedDocuments', JSON.stringify(saved));

    if (editingId === id) editingId = null;

    loadSavedDocuments();
    showToast('Document deleted');
};

// Download PDF
function downloadPdf() {
    const element = document.getElementById('resumePreview');
    const name = document.getElementById('fullName')?.value || document.getElementById('clName')?.value || 'document';
    const filename = `${name.replace(/\s+/g, '_')}_${currentDocType}.pdf`;

    const opt = {
        margin: 0.5,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
    showToast('Downloading PDF...');
}

// Share resume
async function shareResume() {
    const formData = collectFormData();
    const name = formData.fullName || formData.clName;

    if (!name) {
        showToast('Please enter a name first');
        return;
    }

    const shareData = {
        type: currentDocType,
        template: currentTemplate,
        background: currentBackground,
        font: currentFont,
        color: currentColor,
        formData: formData,
        name: name
    };

    try {
        const response = await fetch('/api/resume/share', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(shareData)
        });

        if (!response.ok) {
            throw new Error('Failed to share');
        }

        const result = await response.json();

        // Show the share result
        document.getElementById('shareResult').style.display = 'block';
        document.getElementById('shareUrlInput').value = result.shareUrl;

        showToast('Share link created!');
    } catch (error) {
        showToast('Failed to create share link');
        console.error('Share error:', error);
    }
}

// Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show toast
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
