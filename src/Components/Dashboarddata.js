
import React from 'react'
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import AddLocationIcon from '@mui/icons-material/AddLocation';
import SettingsIcon from '@mui/icons-material/Settings';
import LanguageIcon from '@mui/icons-material/Language';
import ReportIcon from '@mui/icons-material/Report';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import LogoutIcon from '@mui/icons-material/Logout';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import MenuOutlinedIcon from '@mui/icons-material/MenuOutlined';

export const Dashboarddata=[


{
title:'Account',
icon:<AccountCircleIcon/>,
link:"/home"


},

{
title:'Report a Place',
 icon:<FlagOutlinedIcon/>,
link:"/home"
                       
                       
},
{
    title:'Add Place',
    icon:<AddLocationIcon/>,
    link:"/home"
    
    
    },
    {
  title:'Settings',
  icon:<SettingsIcon/>,
 link:"/home"
        
        
 },
  {
     title:'Language',
     icon:<LanguageIcon/>,
  link:"/home"
            
            
},
  {
 title:'Report issue',
 icon:<ReportIcon/>,
link:"/home"
                
                
},
{
  title:'Rate us on the Play Store',
 icon:<StarOutlineIcon />,
 link:"/home"
                    
                    
},

{

title:'Logout',
icon:<LogoutIcon/>,
link:"/"

},




]


